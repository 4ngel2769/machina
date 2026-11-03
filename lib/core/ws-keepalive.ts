import type { WebSocket } from 'ws';

/**
 * Idle-socket keepalive.
 *
 * An idle shell or an idle VNC console sends NOTHING: no keystrokes, no
 * output. The chain in front of us is browser -> Cloudflare -> NPM -> this
 * process, and NPM's effective config here carries `proxy_read_timeout 45s`.
 * Nginx counts ANY bytes read from upstream, so a silent WebSocket is closed
 * out from under us at ~45s. That is the whole bug: the terminal does not
 * crash, it gets reaped by a proxy while nobody is typing.
 *
 * The heartbeat has to live SERVER-side. A browser background tab has its
 * timers throttled to roughly once a minute (and pinned on Firefox after five
 * minutes), so a client-side keepalive would be throttled to exactly the
 * frequency that stops working. This process has no such throttle.
 *
 * Ping frames are ~6 bytes and carry no application payload, so they cannot
 * corrupt the RFB byte stream or the ssh2 stream.
 */
export const KEEPALIVE_MS = Math.max(
  1000,
  parseInt(process.env.WS_KEEPALIVE_MS || '20000', 10) || 20_000,
);

/**
 * Send a ping every `ms` until the socket closes. Also fails the socket if a
 * ping goes unanswered, so a half-open connection (NAT rebind, slept laptop,
 * dead tunnel) is detected instead of looking alive forever.
 */
export function attachKeepalive(
  ws: WebSocket,
  ms: number = KEEPALIVE_MS,
  onDead?: () => void,
): () => void {
  let alive = true;
  let misses = 0;

  const timer = setInterval(() => {
    if (!alive || ws.readyState !== 1) {
      clearInterval(timer);
      return;
    }
    // Two consecutive unanswered pings means the peer is gone. Waiting for the
    // TCP stack to notice can take many minutes through a NAT.
    if (misses >= 2) {
      clearInterval(timer);
      try { ws.terminate(); } catch { /* already gone */ }
      onDead?.();
      return;
    }
    misses += 1;
    try { ws.ping(); } catch { /* closing */ }
  }, ms);

  // Any pong proves the link is up and resets the strike count. Note this
  // fires for the browser's own protocol-level pongs too, which is fine: they
  // are only sent because our ping provoked a response.
  const onPong = () => { misses = 0; };
  const onClose = () => { alive = false; clearInterval(timer); };
  ws.on('pong', onPong);
  ws.on('close', onClose);
  ws.on('error', onClose);

  return () => {
    alive = false;
    clearInterval(timer);
    ws.off('pong', onPong);
    ws.off('close', onClose);
    ws.off('error', onClose);
  };
}