import crypto from 'crypto';
import { config } from '@/lib/config';

/**
 * Short-lived HMAC tokens for websocket access (web terminal + VNC console).
 * Format: b64url(json payload).b64url(hmac-sha256(payload)). Payload carries
 * the instance id, the channel type, the owning user (uid, 'adm' when an
 * admin minted it) and an expiry. Issued by /api/instances/[id]/ws-token
 * after session checks, verified during the WS upgrade in server.ts — before
 * any byte is relayed. A token minted for user A never opens user B's relay.
 */

export type WsChannel = 'term' | 'vnc';

export interface WsTokenPayload {
  inst: string;
  typ: WsChannel;
  uid: string;
  adm?: boolean;
  exp: number; // epoch ms
}

function hmacKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'machina-dev-secret';
  return crypto.createHash('sha256').update(`wsconn:${secret}`).digest();
}

export function mintToken(inst: string, typ: WsChannel, ttlSec = 120, uid = '', adm = false): string {
  const payload: WsTokenPayload = { inst, typ, uid, adm, exp: Date.now() + ttlSec * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', hmacKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string | undefined | null): WsTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', hmacKey()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as WsTokenPayload;
    if (!payload.inst || !payload.typ || !payload.uid || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const WS_URL = (base: string, inst: string, typ: WsChannel) => `${base}/api/instances/${inst}/${typ === 'term' ? 'terminal' : 'console'}`;
