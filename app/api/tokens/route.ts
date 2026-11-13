/**
 * Personal access tokens: list, mint, revoke. The secret is returned once at
 * mint time and never again — the DB keeps only its sha256.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { SCOPES, mintApiToken, listTokens, revokeToken, type Scope } from '@/lib/services/apitoken';
import { rateLimit } from '@/lib/core/crypto';
import { logAudit } from '@/lib/services/audit';

const mintSchema = z.object({
  name: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().optional(),
  id: z.string().optional(), // present => revoke that token instead of minting
}).passthrough();

type MintBody = z.infer<typeof mintSchema>;
type SessionUser = { id: string; name: string; role: string };

function cleanScopes(raw: string[] | undefined): Scope[] | null {
  if (!raw?.length) return null;
  const valid = raw.filter((scope): scope is Scope => (SCOPES as readonly string[]).includes(scope));
  return valid.length === raw.length ? valid : null;
}

/** admin:* is admin-only: a user token must never carry it. */
function scopeRefusal(scopes: Scope[], role: string): string | null {
  if (scopes.includes('admin:*') && role !== 'admin') return 'admin:* requires an admin account';
  return null;
}

async function revoke(user: SessionUser, id: string | undefined) {
  if (!id) return err('id required');
  return revokeToken(user.id, id) ? json({ ok: true }) : err('not found', 404);
}

async function mint(user: SessionUser, body: MintBody) {
  const name = (body.name ?? '').trim().slice(0, 64) || 'token';
  const scopes = cleanScopes(body.scopes);
  if (!scopes) return err(`scopes must be a non-empty subset of: ${SCOPES.join(', ')}`);
  const refused = scopeRefusal(scopes, user.role);
  if (refused) return err(refused, 403);
  const days = typeof body.expiresInDays === 'number' && body.expiresInDays > 0
    ? Math.min(Math.floor(body.expiresInDays), 365) : null;

  const minted = mintApiToken(user.id, name, scopes, days);
  await logAudit({ actorId: user.id, actorName: user.name, action: 'token.mint', target: minted.id, detail: { scopes } });
  return json({ ok: true, token: minted }, 201);
}

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  // Never return the hash or anything derived from the secret.
  return json({ ok: true, scopes: SCOPES, tokens: listTokens(user.id) });
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  if (!rateLimit(`tokmint:${user.id}`, 10, 10 * 60_000)) return err('too many tokens minted; slow down', 429);

  const body = await jsonBody(req, mintSchema);
  return body.id ? revoke(user, body.id) : mint(user, body);
}

export const dynamic = 'force-dynamic';
