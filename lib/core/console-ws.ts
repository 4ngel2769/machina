import net from 'net';
import fs from 'fs';
import type { WebSocket } from 'ws';
import { attachKeepalive } from './ws-keepalive';

/**
 * VNC console relay: browser WS <-> per-instance VNC unix socket. RFB is
 * byte-transparent here, so the relay is a dumb bidirectional pump; the VNC
 * password handshake stays inside RFB between noVNC and QEMU. Connection
 * legality is enforced by the token check at upgrade time in server.ts.
 */
export function relayVnc(ws: WebSocket, socketPath: string): void {
  if (!fs.existsSync(socketPath)) {
    try { ws.send(JSON.stringify({ t: 'e', d: 'vnc socket missing (is the VM running?)' })); } catch {}
    try { ws.close(); } catch {}
    return;
  }

  // An untouched VNC session is as silent as an untouched shell, so it gets
  // the same keepalive for the same reason.
  const stopKeepalive = attachKeepalive(ws);
  const stopAll = () => { stopKeepalive(); };
  ws.on('close', stopAll);
  ws.on('error', stopAll);

  const sock = net.connect({ path: socketPath });
  let sockReady = false;

  sock.on('connect', () => { sockReady = true; });
  sock.on('data', (d: Buffer) => { if (ws.readyState === 1) ws.send(d); });
  sock.on('close', () => { try { ws.close(); } catch {} });
  sock.on('error', () => { try { ws.close(); } catch {} });

  ws.on('message', (d) => {
    if (sockReady) sock.write(d as Buffer);
  });
  ws.on('close', () => { sock.destroy(); });
  ws.on('error', () => { sock.destroy(); });
}
