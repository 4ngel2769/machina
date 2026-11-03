// Throwaway: prove an IDLE terminal websocket survives the proxy chain.
//
// The whole bug: an idle shell sends no bytes, NPM's proxy_read_timeout (45s
// on this host) reaps the connection, and the browser then shows a dead
// terminal. This opens a real terminal socket through the PUBLIC url
// (Cloudflare -> NPM -> blade), touches nothing, and reports whether it is
// still alive after HOLD_MS. Before the server-side heartbeat it dies at ~45s.
import { encode } from 'next-auth/jwt';
import WebSocket from 'ws';
import { rawDb } from '../lib/db/index.ts';

const BASE = 'http://127.0.0.1:3999';
const PUBLIC = 'platform.adev0.eu';
const HOLD_MS = Number(process.argv[2] ?? 210_000);

async function main() {
  const db = rawDb();
  const admin = db.prepare(`select id, name, role from users where role = 'admin' limit 1`).get() as
    { id: string; name: string; role: string };
  const inst = db.prepare(
    `select id, domain_name, ip from instances where status = 'running' and ip <> '192.168.184.52' limit 1`,
  ).get() as { id: string; domain_name: string; ip: string };

  const jwt = await encode({
    token: { sub: admin.id, id: admin.id, name: admin.name, role: admin.role },
    secret: process.env.AUTH_SECRET as string,
    salt: 'authjs.session-token',
    maxAge: 600,
  });
  const cookie = `authjs.session-token=${jwt}`;
  const origin = `https://${PUBLIC}`;

  const tokRes = await fetch(`${BASE}/api/instances/${inst.id}/ws-token`, {
    method: 'POST',
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'term' }),
  });
  const tok = await tokRes.json() as { token?: string; error?: string };
  if (!tok.token) throw new Error(`ws-token failed: ${JSON.stringify(tok)}`);

  console.log(`instance ${inst.domain_name} (${inst.ip})`);
  console.log(`holding an idle terminal socket for ${Math.round(HOLD_MS / 1000)}s through wss://${PUBLIC}`);
  console.log('(NPM proxy_read_timeout on this host is 45s)\n');

  const t0 = Date.now();
  const ws = new WebSocket(
    `wss://${PUBLIC}/api/instances/${inst.id}/terminal?token=${encodeURIComponent(tok.token)}`,
    { headers: { Cookie: cookie, Origin: origin } },
  );

  let pings = 0;
  let bytes = 0;
  let shellBytes = 0;
  let closed: string | null = null;
  ws.on('ping', () => { pings += 1; });
  ws.on('message', (d: Buffer) => { bytes += d.byteLength; shellBytes += d.byteLength; });

  await new Promise<void>((res) => { ws.on('open', () => res()); });
  console.log(`socket open at +0s`);

  const timer = setInterval(() => {
    const el = Math.round((Date.now() - t0) / 1000);
    console.log(`  +${el}s  state=${ws.readyState} (1=open)  pings-from-server=${pings}  shell-bytes=${shellBytes}`);
    if (ws.readyState !== 1 && !closed) {
      closed = `socket left OPEN state at ~${el}s`;
      console.log(`\nRESULT: FAIL — ${closed}`);
      clearInterval(timer);
      try { ws.terminate(); } catch { /* gone */ }
      res();
    }
  }, 15_000);

  await new Promise<void>((res) => {
    ws.on('close', (code, r) => {
      if (!closed) {
        closed = `server closed: code=${code} reason=${r?.toString() || '(none)'}`;
        console.log(`\nRESULT: FAIL — ${closed} at +${Math.round((Date.now() - t0) / 1000)}s`);
      }
      clearInterval(timer);
      res();
    });
    ws.on('error', (e) => {
      if (!closed) {
        closed = `socket error: ${(e as Error).message}`;
        console.log(`\nRESULT: FAIL — ${closed}`);
      }
      clearInterval(timer);
      res();
    });
    setTimeout(() => {
      clearInterval(timer);
      if (ws.readyState === 1) {
        console.log(`\nRESULT: PASS — still open after ${Math.round((Date.now() - t0) / 1000)}s idle`);
        console.log(`  ${pings} keepalive pings received, ${shellBytes} shell bytes`);
        try { ws.close(); } catch { /* gone */ }
      }
      res();
    }, HOLD_MS);
  });

  process.exit(closed ? 1 : 0);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });