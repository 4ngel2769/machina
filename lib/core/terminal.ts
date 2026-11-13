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
  // The client sends its size (and can send keystrokes) the moment the socket
  // opens, which is usually BEFORE the ssh handshake finishes. Those frames
  // used to hit no listener at all and were dropped, leaving the guest PTY
  // at sshd's default (typically 80x24) until the user resized the browser
  // window — which is why TUIs came up small. Attach the message handler
  // immediately and buffer the newest size until the stream exists.
  let stream: import('ssh2').ClientChannel | null = null;
  let pendingSize: { cols: number; rows: number } | null = null;

  ws.on('message', (raw, isBinary) => {
    if (closed) return;
    try {
      if (isBinary) {
        // stdin can arrive before the shell stream exists; drop it rather
        // than buffer arbitrary amounts of typed input.
        if (stream) stream.write(raw as Buffer);
        return;
      }
      const msg = JSON.parse(String(raw)) as { t: string; d?: string; c?: number; r?: number };
      if (msg.t === 'i' && typeof msg.d === 'string') {
        if (stream) stream.write(Buffer.from(msg.d, 'base64'));
      } else if (msg.t === 'r') {
        const cols = Math.min(Math.max(msg.c ?? 80, 1), 500);
        const rows = Math.min(Math.max(msg.r ?? 24, 1), 200);
        pendingSize = { cols, rows };
        if (stream) { stream.setWindow(rows, cols, 0, 0); pendingSize = null; }
      } else if (msg.t === 'c') close('client close');
    } catch { /* frame-level tolerance: malformed envelope is dropped */ }
  });
  ws.on('close', () => close('socket close'));
  ws.on('error', () => close('socket error'));

  conn.on('ready', () => {
    if (closed) return;
    conn!.shell({ term: 'xterm-256color' }, (err, s) => {
      if (err || closed) return fail(`shell: ${err?.message ?? 'closed'}`);
      stream = s;
      ws.send(JSON.stringify({ t: 'ready' }));
      if (pendingSize) {
        s.setWindow(pendingSize.rows, pendingSize.cols, 0, 0);
        pendingSize = null;
      }
      s.on('data', (d: Buffer) => {
        if (ws.readyState === 1 && !closed) ws.send(d);
      });
      s.on('close', () => close('stream end'));
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
