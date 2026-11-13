/**
 * Docker stream relays: browser WS <-> `docker logs -f` or `docker exec`.
 *
 * The wire protocol matches the VM terminal relay so the client plumbing is
 * identical: binary frames carry raw process output, text frames carry
 * {"t":"i","d":"<base64 stdin>"} | {"t":"r","c":cols,"r":rows} | {"t":"c"},
 * and {"t":"ready"} announces the stream is live.
 *
 * Both relays spawn through lib/host/docker.ts's streamDocker so argv never
 * touches a shell. The container reference is validated at upgrade time and
 * again inside the relay — defence in depth, because a WS token is bearer
 * material for 120 seconds.
 */

import type { WebSocket } from 'ws';
import { attachKeepalive } from './ws-keepalive';
import { logInfo } from '@/lib/core/log';
import { streamDocker } from '@/lib/host/docker-admin';
import { validRef } from '@/lib/host/docker';

type ClientFrame = { t: string; d?: string; c?: number; r?: number };

type StreamState = {
  closed: boolean;
  stdin: import('stream').Writable | null;
  kill: (() => void) | null;
  /** Optional stdin transform. Exec uses it to turn the terminal's \r into
   *  the \n a pty's icrnl would have produced — without a pty, sh waits
   *  forever on a bare carriage return. */
  inputMap?: (data: Buffer) => Buffer;
};

/** \r\n and lone \r both become \n. Byte-level via latin1: \r/\n can never
 *  appear inside a multibyte UTF-8 sequence, so this cannot corrupt input. */
function crlfToLf(data: Buffer): Buffer {
  return Buffer.from(data.toString('latin1').replace(/\r\n?/g, '\n'), 'latin1');
}

function stdinWrite(stream: import('stream').Writable | null, data: Buffer | string, map?: (d: Buffer) => Buffer): void {
  if (!stream || stream.destroyed || stream.writableEnded) return;
  try {
    const buf = typeof data === 'string' ? Buffer.from(data) : data;
    stream.write(map ? map(buf) : buf);
  } catch { /* process already gone */ }
}

function sendError(ws: WebSocket, message: string): void {
  try { ws.send(JSON.stringify({ t: 'e', d: message })); } catch { /* socket may already be closing */ }
}

function handleTextFrame(
  msg: ClientFrame,
  state: StreamState,
  onResize: ((cols: number, rows: number) => void) | null,
  close: (why: string) => void,
): void {
  if (msg.t === 'i' && typeof msg.d === 'string') {
    stdinWrite(state.stdin, Buffer.from(msg.d, 'base64'), state.inputMap);
    return;
  }
  if (msg.t === 'r' && onResize) {
    const cols = Math.min(Math.max(msg.c ?? 80, 1), 500);
    const rows = Math.min(Math.max(msg.r ?? 24, 1), 200);
    onResize(cols, rows);
    return;
  }
  if (msg.t === 'c') close('client close');
}

/** Shared frame handler: base64 stdin, resize (exec only), client close. */
function wireFrames(
  ws: WebSocket,
  state: StreamState,
  onResize: ((cols: number, rows: number) => void) | null,
  close: (why: string) => void,
): void {
  ws.on('message', (raw, isBinary) => {
    if (state.closed) return;
    try {
      if (isBinary) {
        stdinWrite(state.stdin, raw as Buffer, state.inputMap);
        return;
      }
      handleTextFrame(JSON.parse(String(raw)) as ClientFrame, state, onResize, close);
    } catch { /* frame-level tolerance: malformed envelope is dropped */ }
  });
  ws.on('close', () => close('socket close'));
  ws.on('error', () => close('socket error'));
}

function teardown(state: StreamState, ws: WebSocket, why: string, tag: string): void {
  if (state.closed) return;
  state.closed = true;
  try { state.kill?.(); } catch { /* already gone */ }
  try { ws.close(); } catch { /* already closed */ }
  logInfo(`[docker-${tag}] closed: ${why}`);
}

/** `docker logs -f --tail N <ref>` — one-way stream, stdin unused. */
export function relayContainerLogs(ws: WebSocket, ref: string, tail = 500): void {
  if (!validRef(ref)) { sendError(ws, 'invalid container reference'); ws.close(); return; }
  const state: StreamState = { closed: false, stdin: null, kill: null };
  const stopKeepalive = attachKeepalive(ws);
  const close = (why: string) => { stopKeepalive(); teardown(state, ws, why, 'logs'); };

  const boundedTail = Math.min(5000, Math.max(10, Math.trunc(tail)));
  const stream = streamDocker(['logs', '-f', '--tail', String(boundedTail), ref], {
    onData: (chunk) => { if (ws.readyState === 1 && !state.closed) ws.send(chunk); },
    onExit: (code) => {
      if (!state.closed) sendError(ws, `log stream ended${code === null ? '' : ` (exit ${code})`}`);
      close('stream end');
    },
    onError: (message) => { sendError(ws, `docker: ${message}`); close('spawn error'); },
  });
  state.stdin = stream.stdin;
  state.kill = stream.kill;
  ws.send(JSON.stringify({ t: 'ready' }));
  wireFrames(ws, state, null, close);
}

/** `docker exec -i <ref> sh` — full duplex over pipes. -t is deliberately
 *  absent: a piped stdin is not a terminal, and docker refuses the combo
 *  ("cannot attach stdin to a TTY-enabled container"). The client still gets
 *  a working line shell; full-screen TUIs inside the container won't render,
 *  which is the correct trade for a web console. Resize is a no-op here —
 *  without a pty there is nothing to resize. */
export function relayContainerExec(ws: WebSocket, ref: string, command: string, cols: number, rows: number): void {
  if (!validRef(ref)) { sendError(ws, 'invalid container reference'); ws.close(); return; }
  const state: StreamState = { closed: false, stdin: null, kill: null, inputMap: crlfToLf };
  const stopKeepalive = attachKeepalive(ws);
  const close = (why: string) => { stopKeepalive(); teardown(state, ws, why, 'exec'); };

  const shell = command || 'sh';
  const stream = streamDocker(
    // -i (interactive stdin) but no -t: a pty needs a real terminal on our
    // side, which a websocket is not. sh still works as a line editor; full
    // -screen TUIs inside the container won't render — correct trade.
    ['exec', '-i', ref, 'sh', '-c', `exec ${shell}`],
    {
      onData: (chunk) => { if (ws.readyState === 1 && !state.closed) ws.send(chunk); },
      onExit: (code) => {
        if (!state.closed) sendError(ws, `exec ended${code === null ? '' : ` (exit ${code})`}`);
        close('stream end');
      },
      onError: (message) => { sendError(ws, `docker: ${message}`); close('spawn error'); },
    },
  );
  state.stdin = stream.stdin;
  state.kill = stream.kill;
  ws.send(JSON.stringify({ t: 'ready' }));
  wireFrames(ws, state, null, close);
}
