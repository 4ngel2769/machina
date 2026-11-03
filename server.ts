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
import { verifyToken, type WsChannel } from '@/lib/core/tokens';
import { relayTerm } from '@/lib/core/terminal';
import { relayVnc } from '@/lib/core/console-ws';
import { decrypt } from '@/lib/core/crypto';

/**
 * Boot sequence:
 *   ensureSetup (pools/network) -> DB migrate+seed -> Next -> listen
 *   then worker + metering + reconciler loops. WS upgrade routes:
 *     /api/instances/<id>/terminal  (token) -> ssh2 relay
 *     /api/instances/<id>/console   (token) -> vnc unix socket relay
 */

const dev = process.env.NODE_ENV !== 'production';
// next() reads NODE_ENV on construct; normalise it now (assignment is safe via cast).
(process.env as { NODE_ENV?: string }).NODE_ENV = dev ? 'development' : 'production';

const app = next({ dev, turbopack: dev });

// Worker wake-up needs to flow from enqueue(): jobs.ts registers a waker hook
// that server swaps in at boot (avoids a circular import).
import { setWaker } from '@/lib/core/jobs';

let wss: WebSocketServer;

async function main(): Promise<void> {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 24) {
    console.error('[machina] refusing to boot: AUTH_SECRET missing or too short (need >=24 chars)');
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
    const u = parse(req.url || '', true);
    void handleUpgrade(req, socket as import('net').Socket, head, u.pathname || '');
  });

  const port = parseInt(process.env.SERVER_PORT || String(config.serverPort ?? 3999), 10);
  server.listen(port, () => {
    console.log(`[machina] listening on :${port} (dev=${dev})`);
  });

  startWorker();
  startMetering();
  startNetmeter();
  startReconciler();

  const shutdown = () => {
    console.log('[machina] shutting down');
    stopWorker(); stopMetering(); stopNetmeter(); stopReconciler();
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ------------------------------------------------------------- WS upgrade

const WS_PATH = /^\/api\/instances\/(vm_[0-9a-f]+)\/(terminal|console)$/;

async function handleUpgrade(
  req: IncomingMessage,
  socket: import('net').Socket,
  head: Buffer,
  pathname: string,
): Promise<void> {
  const m = WS_PATH.exec(pathname);
  if (!m) { socket.destroy(); return; }
  const [, instId, pathChan] = m;
  const chan: WsChannel = pathChan === 'terminal' ? 'term' : 'vnc';
  const token = (parse(req.url || '', true).query.token as string) || '';
  const payload = verifyToken(token);
  if (!payload || payload.inst !== instId || payload.typ !== chan) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const inst = rawDb().prepare(`select * from instances where id=?`).get(instId) as
    | { status: string; ip: string; root_pass_enc: string; vnc_socket: string; domain_name: string; user_id: string }
    | undefined;
  if (!inst) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  // Token is user-bound (mintToken(uid)); admins may mint for any instance.
  if (!payload.adm && payload.uid !== inst.user_id) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (inst.status !== 'running') {
    socket.write('HTTP/1.1 409 Conflict\r\n\r\n'); // "instance not running"
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    if (chan === 'term') {
      void relayTerm(ws, { instanceId: instId, ip: inst.ip, rootPassword: decrypt(inst.root_pass_enc) });
    } else {
      relayVnc(ws, inst.vnc_socket || `${config.storageDir}/vnc/${instId}.vnc`);
    }
  });
}
main().catch((e) => {
  console.error('[machina] boot failed:', e);
  process.exit(1);
});
