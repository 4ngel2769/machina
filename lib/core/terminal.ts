/**
 * SSH terminal relay: websocket to guest shell, with an optional persistent session.
 */
import type { WebSocket } from 'ws';
import { attachKeepalive } from './ws-keepalive';

/**
 * Web terminal: browser WS <-> ssh2 session on the guest (root@guest-ip:22,
 * the cloud-init root password). The client speaks a tiny JSON envelope over
 * the websocket; resize and stdin share the pipe:
 *   in:  {"t":"i","d":"<base64 stdin>"} | {"t":"r","c":<cols>,"r":<rows>} | {"t":"c"}
 *   out: binary frames = stdout; text frames = {t:"ready"|"e"}.
 */
export interface TermBind {
  instanceId: string;
  ip: string;
  rootPassword: string;
  /** Attach-or-create a tmux/screen session in the guest so the shell (and
   *  whatever is running in it) survives disconnects and page reloads. */
  persist?: boolean;
  /** Client's current grid size, used to spawn tmux at the right dimensions
   *  instead of its 80x24 default. */
  cols?: number;
  rows?: number;
}

/** tmux attach-or-create, or screen equivalent, with a plain-shell fallback
 *  when the guest has neither multiplexer. */
function persistentCommand(cols: number, rows: number): string {
  const clampedCols = Math.min(Math.max(Math.floor(cols) || 80, 1), 500);
  const clampedRows = Math.min(Math.max(Math.floor(rows) || 24, 1), 200);
  return `if command -v tmux >/dev/null 2>&1; then exec tmux new-session -A -s machina -x ${clampedCols} -y ${clampedRows}; ` +
    `elif command -v screen >/dev/null 2>&1; then exec screen -x machina || exec screen -S machina; ` +
    `else echo 'no tmux or screen on this guest — plain shell'; exec bash -l; fi`;
}

type ClientFrame = { t: string; d?: string; c?: number; r?: number };
type Stream = import('ssh2').ClientChannel;

type TermState = {
  closed: boolean;
  stream: Stream | null;
  /** Newest client size seen before the shell stream existed. */
  pendingSize: { cols: number; rows: number } | null;
};

function writeStdin(termState: TermState, raw: Buffer): void {
  // stdin can arrive before the shell stream exists; drop it rather than
  // buffer arbitrary amounts of typed input.
  if (termState.stream) termState.stream.write(raw);
}

function writeBase64(termState: TermState, data: string | undefined): void {
  if (typeof data !== 'string' || !termState.stream) return;
  termState.stream.write(Buffer.from(data, 'base64'));
}

function applyResize(termState: TermState, msg: ClientFrame): void {
  const cols = Math.min(Math.max(msg.c ?? 80, 1), 500);
  const rows = Math.min(Math.max(msg.r ?? 24, 1), 200);
  termState.pendingSize = { cols, rows };
  if (!termState.stream) return;
  termState.stream.setWindow(rows, cols, 0, 0);
  termState.pendingSize = null;
}

/**
 * The client sends its size (and can send keystrokes) the moment the socket
 * opens, which is usually BEFORE the ssh handshake finishes. Those frames used
 * to hit no listener at all and were dropped, leaving the guest PTY at sshd's
 * default (typically 80x24) until the user resized the browser window — which
 * is why TUIs came up small. So the handler is attached immediately and the
 * newest size is buffered until the stream exists.
 */
function handleFrame(termState: TermState, raw: unknown, isBinary: boolean, close: (why: string) => void): void {
  if (termState.closed) return;
  try {
    if (isBinary) return writeStdin(termState, raw as Buffer);
    const msg = JSON.parse(String(raw)) as ClientFrame;
    if (msg.t === 'i') return writeBase64(termState, msg.d);
    if (msg.t === 'r') return applyResize(termState, msg);
    if (msg.t === 'c') close('client close');
  } catch { /* frame-level tolerance: malformed envelope is dropped */ }
}

/**
 * Arm the shell channel once SSH is up: announce readiness, replay the size the
 * client sent before the handshake finished, and pipe stdout back.
 */
function onReady(
  conn: import('ssh2').Client,
  ws: WebSocket,
  termState: TermState,
  bind: TermBind,
  close: (why: string) => void,
  fail: (msg: string) => void,
): void {
  if (termState.closed) return;
  const open = (err: Error | undefined, shell?: Stream) => {
    if (err || termState.closed || !shell) return fail(`shell: ${err?.message ?? 'closed'}`);
    termState.stream = shell;
    ws.send(JSON.stringify({ t: 'ready' }));
    if (termState.pendingSize) {
      shell.setWindow(termState.pendingSize.rows, termState.pendingSize.cols, 0, 0);
      termState.pendingSize = null;
    }
    shell.on('data', (chunk: Buffer) => {
      if (ws.readyState === 1 && !termState.closed) ws.send(chunk);
    });
    shell.on('close', () => close('stream end'));
  };
  // Persistent mode runs the multiplexer attach-or-create via exec()+pty. Plain
  // mode keeps the interactive shell() call. exec channels get the same
  // window-change handling; tmux also owns its client size itself.
  if (bind.persist) {
    const cmd = persistentCommand(bind.cols ?? 80, bind.rows ?? 24);
    conn.exec(cmd, {
      pty: { term: 'xterm-256color', cols: bind.cols ?? 80, rows: bind.rows ?? 24 },
    }, open);
  } else {
    conn.shell({ term: 'xterm-256color' }, open);
  }
}

export async function relayTerm(ws: WebSocket, bind: TermBind): Promise<void> {
  const { Client } = await import('ssh2');
  const termState: TermState = { closed: false, stream: null, pendingSize: null };
  const conn = new Client();

  // Must be armed immediately, not after the ssh handshake: the SSH connect
  // alone can outlast the proxy's idle timeout, and a socket that dies before
  // this line runs never gets a chance to be kept alive.
  const stopKeepalive = attachKeepalive(ws);

  const close = (why: string) => {
    if (termState.closed) return;
    termState.closed = true;
    stopKeepalive();
    try { conn.end(); } catch { /* conn may already be ended */ }
    try { ws.close(); } catch { /* already closed */ }
    console.log(`[term] ${bind.instanceId} closed: ${why}`);
  };
  const fail = (msg: string) => {
    try { ws.send(JSON.stringify({ t: 'e', d: msg })); } catch { /* socket may already be closing */ }
    close(msg);
  };

  ws.on('message', (raw, isBinary) => handleFrame(termState, raw, isBinary, close));
  ws.on('close', () => close('socket close'));
  ws.on('error', () => close('socket error'));

  conn.on('ready', () => onReady(conn, ws, termState, bind, close, fail));
  conn.on('error', (sshError) => fail(`ssh: ${sshError.message}`));
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
