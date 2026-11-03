import type { WebSocket } from 'ws';
import { attachKeepalive } from './ws-keepalive';

/**
 * Web terminal: browser WS <-> ssh2 session on the guest (root@guest-ip:22,
 * the cloud-init root password). The client speaks a tiny JSON envelope over
 * the websocket; resize and stdin share the pipe:
 *   in:  {"t":"i","d":"<base64 stdin>"} | {"t":"r","c":<cols>,"r":<rows>} | {"t":"c"}
 *   out: binary frames = stdout; text frames = {t:"ready"|"e"}.
 */
export interface TermBind { instanceId: string; ip: string; rootPassword: string; }

export async function relayTerm(ws: WebSocket, bind: TermBind): Promise<void> {
  const { Client } = await import('ssh2');
  let closed = false;
  let conn: import('ssh2').Client | null = null;

  // Must be armed immediately, not after the ssh handshake: the SSH connect
  // alone can outlast the proxy's idle timeout, and a socket that dies before
  // this line runs never gets a chance to be kept alive.
  const stopKeepalive = attachKeepalive(ws);

  const close = (why: string) => {
    if (closed) return;
    closed = true;
    stopKeepalive();
    try { conn?.end(); } catch {}
    try { ws.close(); } catch {}
    console.log(`[term] ${bind.instanceId} closed: ${why}`);
  };
  const fail = (msg: string) => {
    try { ws.send(JSON.stringify({ t: 'e', d: msg })); } catch {}
    close(msg);
  };

  conn = new Client();
  conn.on('ready', () => {
    if (closed) return;
    conn!.shell({ term: 'xterm-256color' }, (err, stream) => {
      if (err || closed) return fail(`shell: ${err?.message ?? 'closed'}`);
      ws.send(JSON.stringify({ t: 'ready' }));
      stream.on('data', (d: Buffer) => {
        if (ws.readyState === 1 && !closed) ws.send(d);
      });
      stream.on('close', () => close('stream end'));

      ws.on('message', (raw, isBinary) => {
        if (closed) return;
        try {
          if (isBinary) { stream.write(raw as Buffer); return; }
          const msg = JSON.parse(String(raw)) as { t: string; d?: string; c?: number; r?: number };
          if (msg.t === 'i' && typeof msg.d === 'string') stream.write(Buffer.from(msg.d, 'base64'));
          else if (msg.t === 'r') stream.setWindow(msg.r ?? 24, msg.c ?? 80, 0, 0);
          else if (msg.t === 'c') close('client close');
        } catch { /* frame-level tolerance: malformed envelope is dropped */ }
      });
      ws.on('close', () => close('socket close'));
      ws.on('error', () => close('socket error'));
    });
  });
  conn.on('error', (e) => fail(`ssh: ${e.message}`));
  conn.on('close', () => close('ssh end'));
  conn.connect({
    host: bind.ip,
    port: 22,
    username: 'root',
    password: bind.rootPassword,
    readyTimeout: 12_000,
    keepaliveInterval: 15_000,
  });
}
