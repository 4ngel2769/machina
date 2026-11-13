/**
 * SSH public key list, add and remove for the signed-in user.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, uuid, guardMutation, jsonBody, requireScope } from '@/lib/api';
import { z } from 'zod';
import { getDb, rawDb } from '@/lib/db';
import { sshKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { logAudit } from '@/lib/services/audit';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('keys:read');
  if (scopeDenied) return scopeDenied;
  const rows = user.role === 'admin'
    ? await getDb().select().from(sshKeys)
    : await getDb().select().from(sshKeys).where(eq(sshKeys.userId, user.id));
  return json(rows);
}

export async function POST(req: NextRequest) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const scopeDenied = await requireScope('keys:write');
  if (scopeDenied) return scopeDenied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const body = await jsonBody(req, z.object({ label: z.string().optional(), pubKey: z.string().optional() }).passthrough());
  const label = (body.label ?? '').trim().slice(0, 64);
  let pubKey = (body.pubKey ?? '').trim();
  // one-line key: type + base64(+comment)
  if (/^(\ssh-|ecdsa|sk-)/.test(pubKey) || !/^(ssh-(rsa|dss|ed25519)|ecdsa-sha2-\S+|sk-(ssh|ecdsa)-\S+)\s+\S+/.test(pubKey)) {
    return err('not a recognised public key format');
  }
  if (pubKey.split(/\s+/).length < 2) return err('malformed key');
  pubKey = pubKey.replace(/\s+/g, ' ').slice(0, 1024);
  await getDb().insert(sshKeys).values({ id: uuid(), userId: user.id, label: label || pubkeyLabel(pubKey), pubKey, createdAt: now() });
  await logAudit({ actorId: user.id, actorName: user.name, action: 'key.add', detail: { label } });
  return json({ ok: true }, 201);
}

export async function DELETE(req: NextRequest) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const body = await jsonBody(req, z.object({ id: z.string().optional() }).passthrough());
  if (!body.id) return err('id required');
  const [row] = await getDb().select().from(sshKeys).where(eq(sshKeys.id, body.id));
  if (!row) return err('not found', 404);
  if (row.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);
  rawDb().prepare(`delete from ssh_keys where id=?`).run(row.id);
  await logAudit({ actorId: user.id, actorName: user.name, action: 'key.delete', target: row.id });
  return json({ ok: true });
}

function pubkeyLabel(keyText: string): string {
  const parts = keyText.split(/\s+/);
  if (parts.length >= 3) return parts[2].slice(0, 32);
  return parts[0].replace(/^ssh-/, '');
}
