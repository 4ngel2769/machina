/**
 * AES-256-GCM for recoverable secrets, plus password hashing and random ids.
 */
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
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(blob: string): string {
  const [version, ivEncoded, tagEncoded, dataEncoded] = blob.split('.');
  if (version !== 'v1') throw new Error('bad ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivEncoded, 'base64'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataEncoded, 'base64')), decipher.final()]).toString('utf8');
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  try { return bcrypt.compareSync(password, hash); } catch { return false; }
}

export function randToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function randPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const limit = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < 16) {
    for (const byte of crypto.randomBytes(16)) {
      if (byte >= limit) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === 16) break;
    }
  }
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

/** Expired keys are swept on insert, so a caller rotating a header cannot
 *  grow the map without bound. */
function sweepBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.reset < now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    if (buckets.size > 5000) sweepBuckets(now);
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  bucket.n += 1;
  return bucket.n <= limit;
}

/** Clear a bucket after a success. Failed guesses must not count against a
 *  user who eventually got the password right. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
