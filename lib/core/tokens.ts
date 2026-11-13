/**
 * Short-lived HMAC tokens for websocket access (web terminal + VNC console).
 * Format: b64url(json payload).b64url(hmac-sha256(payload)). Payload carries
 * the instance id, the channel type, the owning user (uid, 'adm' when an
 * admin minted it) and an expiry. Issued by /api/instances/[id]/ws-token
 * after session checks, verified during the WS upgrade in server.ts — before
 * any byte is relayed. A token minted for user A never opens user B's relay.
 */

import crypto from 'crypto';
import { config } from '@/lib/config';

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

function signatureMatches(sig: string, want: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function decodePayload(body: string): WsTokenPayload | null {
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString()) as WsTokenPayload;
  } catch {
    return null;
  }
}

/** Every field the relays depend on must be present, and the token unexpired. */
function isUsable(p: WsTokenPayload | null): p is WsTokenPayload {
  if (!p) return false;
  if (!p.inst || !p.typ || !p.uid) return false;
  if (typeof p.exp !== 'number') return false;
  return p.exp >= Date.now();
}

export function verifyToken(token: string | undefined | null): WsTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', hmacKey()).update(body).digest('base64url');
  if (!signatureMatches(sig, want)) return null;
  const payload = decodePayload(body);
  return isUsable(payload) ? payload : null;
}

export const WS_URL = (base: string, inst: string, typ: WsChannel) => `${base}/api/instances/${inst}/${typ === 'term' ? 'terminal' : 'console'}`;
