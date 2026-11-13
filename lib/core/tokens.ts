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
import { now } from '@/lib/core/util';

export type WsChannel = 'term' | 'vnc' | 'exec' | 'logs';

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

export function mintToken(instanceId: string, channel: WsChannel, ttlSec = 120, userId = '', isAdmin = false): string {
  const payload: WsTokenPayload = { inst: instanceId, typ: channel, uid: userId, adm: isAdmin, exp: now() + ttlSec * 1000 };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', hmacKey()).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function signatureMatches(signature: string, expected: string): boolean {
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return provided.length === wanted.length && crypto.timingSafeEqual(provided, wanted);
}

function decodePayload(encodedPayload: string): WsTokenPayload | null {
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as WsTokenPayload;
  } catch {
    return null;
  }
}

/** Every field the relays depend on must be present, and the token unexpired. */
function isUsable(tokenPayload: WsTokenPayload | null): tokenPayload is WsTokenPayload {
  if (!tokenPayload) return false;
  if (!tokenPayload.inst || !tokenPayload.typ || !tokenPayload.uid) return false;
  if (typeof tokenPayload.exp !== 'number') return false;
  return tokenPayload.exp >= now();
}

export function verifyToken(token: string | undefined | null): WsTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', hmacKey()).update(encodedPayload).digest('base64url');
  if (!signatureMatches(signature, expected)) return null;
  const tokenPayload = decodePayload(encodedPayload);
  return isUsable(tokenPayload) ? tokenPayload : null;
}

export const WS_URL = (base: string, instanceId: string, channel: WsChannel) => `${base}/api/instances/${instanceId}/${channel === 'term' ? 'terminal' : 'console'}`;
