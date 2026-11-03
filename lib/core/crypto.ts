import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { config } from '@/lib/config';

/** AES-256-GCM for values that must be recoverable (root passwords). */
function key(): Buffer {
  let secret = config.masterKey || '';
  if (!secret) {
    const file = path.join(dataDir(), 'machina.key');
    try {
      secret = fs.readFileSync(file, 'utf8').trim();
    } catch {
      secret = crypto.randomBytes(32).toString('hex');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, secret, { mode: 0o600 });
    }
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(blob: string): string {
  const [v, ivB, tagB, dataB] = blob.split('.');
  if (v !== 'v1') throw new Error('bad ciphertext version');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

export function verifyPassword(pw: string, hash: string): boolean {
  try { return bcrypt.compareSync(pw, hash); } catch { return false; }
}

export function randToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (const b of crypto.randomBytes(16)) out += alphabet[b % alphabet.length];
  return out;
}

export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(8).toString('hex');
}

function dataDir(): string {
  return path.dirname(config.dbPath);
}

/** Throttled in-memory rate limiter, single-process. */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  b.n += 1;
  return b.n <= limit;
}
