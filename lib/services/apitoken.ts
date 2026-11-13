/**
 * Personal access tokens for the API.
 *
 * Modelled on Immich's token permissions: a token is a named credential with
 * an explicit scope list, minted once and shown once. Only the sha256 of the
 * secret is stored, so a database leak does not leak usable tokens. Every
 * scope is checked per-route; admin powers require the admin:* scopes AND an
 * admin account — a token can never widen what its owner could do in the UI.
 *
 * Token format: machina_<64 hex>. The stored prefix (first 12 chars) is for
 * display and audit only; lookup is by full-secret hash.
 */

import crypto from 'crypto';
import { rawDb } from '@/lib/db';
import { newId } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';

export const TOKEN_PREFIX = 'machina_';

/** Every scope a token can carry. Keep in sync with the routes that check. */
export const SCOPES = [
  'instances:read', 'instances:write',
  'requests:read', 'requests:write',
  'keys:read', 'keys:write',
  'quota:read', 'billing:read', 'account:read',
  'notifications:read', 'notifications:write',
  'admin:*',
] as const;

export type Scope = (typeof SCOPES)[number];

export type ApiTokenRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: string;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
};

export type MintedToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  /** The full secret — returned exactly once, never stored. */
  secret: string;
  expiresAt: number | null;
};

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Parse a stored scopes JSON array into validated scope names. */
export function parseScopes(raw: string): Scope[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Scope => typeof item === 'string' && isScope(item));
  } catch {
    return [];
  }
}

/**
 * Mint a token for a user. name is a human label; scopes must all be known;
 * expiresInDays null means no expiry. Returns the secret once.
 */
export function mintApiToken(
  userId: string,
  name: string,
  scopes: Scope[],
  expiresInDays: number | null,
): MintedToken {
  const secret = TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
  const id = newId('tok_');
  const ts = now();
  const expiresAt = expiresInDays ? ts + expiresInDays * 86_400_000 : null;
  rawDb().prepare(
    `insert into api_tokens (id, user_id, name, prefix, hash, scopes, expires_at, created_at)
     values (?,?,?,?,?,?,?,?)`,
  ).run(id, userId, name, secret.slice(0, 16), hashSecret(secret), JSON.stringify(scopes), expiresAt, ts);
  return { id, name, prefix: secret.slice(0, 16), scopes, secret, expiresAt };
}

/**
 * Resolve a bearer secret to its owner row, or null. Checks revocation and
 * expiry, and stamps last_used_at (throttled to once a minute per token so a
 * chatty client does not turn every request into a write).
 */
export function resolveToken(secret: string): { token: ApiTokenRow; scopes: Scope[] } | null {
  if (!secret.startsWith(TOKEN_PREFIX)) return null;
  const row = rawDb().prepare(`select * from api_tokens where hash=?`).get(hashSecret(secret)) as ApiTokenRow | undefined;
  if (!row || row.revoked_at !== null) return null;
  const ts = now();
  if (row.expires_at !== null && row.expires_at <= ts) return null;
  if (row.last_used_at === null || ts - row.last_used_at > 60_000) {
    rawDb().prepare(`update api_tokens set last_used_at=? where id=?`).run(ts, row.id);
  }
  return { token: row, scopes: parseScopes(row.scopes) };
}

/** Does this token carry the scope? admin:* satisfies any admin check. */
export function hasScope(scopes: Scope[], needed: Scope): boolean {
  return scopes.includes(needed) || scopes.includes('admin:*');
}

export function listTokens(userId: string): Omit<ApiTokenRow, 'hash'>[] {
  return rawDb().prepare(
    `select id, user_id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at
     from api_tokens where user_id=? order by created_at desc`,
  ).all(userId) as Omit<ApiTokenRow, 'hash'>[];
}

export function revokeToken(userId: string, id: string): boolean {
  return rawDb().prepare(
    `update api_tokens set revoked_at=? where id=? and user_id=? and revoked_at is null`,
  ).run(now(), id, userId).changes > 0;
}
