/**
 * Admin decision on a user's account-deletion request.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { requireAdmin, json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances, users, sshKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { enqueue } from '@/lib/core/jobs';
import { logAudit } from '@/lib/services/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const raw = rawDb();
  const requestRow = raw.prepare(`select * from deletion_requests where id=?`).get(id) as
    | { id: string; user_id: string; status: string } | undefined;
  if (!requestRow) return err('not found', 404);
  if (requestRow.status !== 'pending') return err('already handled', 409);

  const body = (await req.json().catch(() => ({}))) as { op?: string; note?: string };
  const op = body.op === 'fulfill' ? 'fulfill' : body.op === 'reject' ? 'reject' : null;
  if (!op) return err('op must be fulfill|reject');

  if (op === 'reject') {
    rawDb().prepare(`update deletion_requests set status='rejected', fulfilled_at=?, fulfilled_by=? where id=?`).run(now(), admin.id, id);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'gdpr.delete.reject', target: id });
    return json({ ok: true, status: 'rejected' });
  }

  // fulfill: destroy all user's VMs, wipe personal data, delete the account
  const insts = raw.prepare(`select id from instances where user_id=?`).all(requestRow.user_id) as { id: string }[];
  for (const inst of insts) {
    await enqueue({ type: 'instance.delete', instanceId: inst.id, userId: requestRow.user_id, payload: {} }).catch(() => {});
  }
  // wipe personal data immediately (VM rows remain until destroy jobs finish)
  raw.prepare(`delete from ssh_keys where user_id=?`).run(requestRow.user_id);
  raw.prepare(`delete from ledger where user_id=?`).run(requestRow.user_id);
  raw.prepare(`delete from instance_requests where user_id=?`).run(requestRow.user_id);
  raw.prepare(`delete from deletion_requests where user_id=?`).run(requestRow.user_id);
  // remove the account
  const db = getDb();
  await db.delete(users).where(eq(users.id, requestRow.user_id));
  rawDb().prepare(`update deletion_requests set status='fulfilled', fulfilled_at=?, fulfilled_by=? where id=?`).run(now(), admin.id, id);

  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'gdpr.delete.fulfill', target: requestRow.user_id, detail: { instances: insts.map((inst) => inst.id) } });
  return json({ ok: true, status: 'fulfilled', destroyed: insts.length });
}

export const dynamic = 'force-dynamic';
