/**
 * Boot sequence:
 *   ensureSetup (pools/network) -> DB migrate+seed -> Next -> listen
 *   then worker + metering + reconciler loops. WS upgrade routes:
 *     /api/instances/<id>/terminal  (token) -> ssh2 relay
 *     /api/instances/<id>/console   (token) -> vnc unix socket relay
 *     /api/containers/<ref>/(exec|logs) (admin token) -> docker exec/logs -f
 */

import { createServer } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import next from 'next';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { config } from '@/lib/config';
import { ensureSetupSafe } from '@/lib/core/driver';
import { ensureDbReady, rawDb } from '@/lib/db';
import { runSeed } from '@/lib/db/seed';
import { startWorker, stopWorker } from '@/lib/core/worker';
import { startMetering, stopMetering } from '@/lib/core/metering';
import { startNetmeter, stopNetmeter } from '@/lib/core/netmeter';
import { startReconciler, stopReconciler } from '@/lib/core/reconciler';
import { startHostSampler, stopHostSampler } from '@/lib/host/sampler';
import { verifyToken, type WsChannel } from '@/lib/core/tokens';
import { relayTerm } from '@/lib/core/terminal';
import { relayVnc } from '@/lib/core/console-ws';
import { relayContainerExec, relayContainerLogs } from '@/lib/core/docker-ws';
import { validRef } from '@/lib/host/docker';
import { decrypt } from '@/lib/core/crypto';

const dev = process.env.NODE_ENV !== 'production';
// next() reads NODE_ENV on construct; normalise it now (assignment is safe via cast).
(process.env as { NODE_ENV?: string }).NODE_ENV = dev ? 'development' : 'production';

const app = next({ dev, turbopack: dev });

// Worker wake-up needs to flow from enqueue(): jobs.ts registers a waker hook
// that server swaps in at boot (avoids a circular import).
import { setWaker } from '@/lib/core/jobs';
import { logError, logInfo } from '@/lib/core/log';

let wss: WebSocketServer;

async function main(): Promise<void> {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 24) {
    logError('[machina] refusing to boot: AUTH_SECRET missing or too short (need >=24 chars)');
    process.exit(1);
  }
  await ensureSetupSafe();
  ensureDbReady();
  await runSeed();

  await app.prepare();
  const handler = app.getRequestHandler();
  setWaker(() => { void import('@/lib/core/worker').then((w) => w.wakingTick()); });

  wss = new WebSocketServer({ noServer: true });
  const server = createServer((req, res) => void handler(req, res));
  server.on('upgrade', (req, socket, head) => {
    const parsed = parse(req.url || '', true);
    void handleUpgrade(req, socket as import('net').Socket, head, parsed.pathname || '');
  });

  const port = parseInt(process.env.SERVER_PORT || String(config.serverPort ?? 3999), 10);
  server.listen(port, () => {
    logInfo(`[machina] listening on :${port} (dev=${dev})`);
  });

  startWorker();
  startMetering();
  startNetmeter();
  startReconciler();
  startHostSampler();

  const shutdown = () => {
    logInfo('[machina] shutting down');
    stopWorker(); stopMetering(); stopNetmeter(); stopReconciler(); stopHostSampler();
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ------------------------------------------------------------- WS upgrade

const WS_PATH = /^\/api\/instances\/(vm_[0-9a-f]+)\/(terminal|console)$/;
const CONT_WS_PATH = /^\/api\/containers\/([A-Za-z0-9][A-Za-z0-9_.-]{0,254})\/(exec|logs)$/;

async function handleUpgrade(
  req: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
  pathname: string,
): Promise<void> {
  // Container streams are admin-only and checked before the instance path so
  // a container id can never be mistaken for a vm_ id (the regexes are
  // disjoint anyway, but order keeps the intent obvious).
  const contMatch = CONT_WS_PATH.exec(pathname);
  if (contMatch) {
    await handleContainerUpgrade(req, socket, head, contMatch[1], contMatch[2]);
    return;
  }
  const wsMatch = WS_PATH.exec(pathname);
  if (!wsMatch) { socket.destroy(); return; }
  const [, instId, pathChan] = wsMatch;
  const chan: WsChannel = pathChan === 'terminal' ? 'term' : 'vnc';
  const query = parse(req.url || '', true).query;
  const token = (query.token as string) || '';
  const persist = query.persist === '1';
  const payload = verifyToken(token);
  if (!payload || payload.inst !== instId || payload.typ !== chan) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const instanceRow = rawDb().prepare(`select * from instances where id=?`).get(instId) as
    | { status: string; ip: string; root_pass_enc: string; vnc_socket: string; domain_name: string; user_id: string }
    | undefined;
  if (!instanceRow) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  // Token is user-bound (mintToken(uid)); admins may mint for any instance.
  if (!payload.adm && payload.uid !== instanceRow.user_id) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (instanceRow.status !== 'running') {
    socket.write('HTTP/1.1 409 Conflict\r\n\r\n'); // "instance not running"
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    if (chan === 'term') {
      void relayTerm(ws, {
        instanceId: instId,
        ip: instanceRow.ip,
        rootPassword: decrypt(instanceRow.root_pass_enc),
        persist,
        cols: Number(query.cols) || undefined,
        rows: Number(query.rows) || undefined,
      });
    } else {
      relayVnc(ws, instanceRow.vnc_socket || `${config.storageDir}/vnc/${instId}.vnc`);
    }
  });
}

/** Container exec/logs upgrade: HMAC token says admin + channel; the docker
 *  CLI does the rest. Container state is checked live — a stopped container
 *  cannot exec, and logs still work. */
async function handleContainerUpgrade(
  req: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
  ref: string,
  pathChan: string,
): Promise<void> {
  const chan = pathChan === 'exec' ? 'exec' : 'logs';
  const query = parse(req.url || '', true).query;
  const token = (query.token as string) || '';
  const payload = verifyToken(token);
  if (!payload || payload.typ !== chan || !payload.adm) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!validRef(ref)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  // exec needs a running container; logs works on any state.
  if (chan === 'exec') {
    try {
      const { inspectContainer } = await import('@/lib/host/docker-admin');
      const detail = await inspectContainer(ref);
      if (detail.state !== 'running') {
        socket.write('HTTP/1.1 409 Conflict\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    if (chan === 'exec') {
      const command = typeof query.cmd === 'string' ? query.cmd.slice(0, 400) : '';
      relayContainerExec(ws, ref, command, Number(query.cols) || 80, Number(query.rows) || 24);
    } else {
      relayContainerLogs(ws, ref, Number(query.tail) || 500);
    }
  });
}
main().catch((e) => {
  logError('[machina] boot failed:', e);
  process.exit(1);
});
