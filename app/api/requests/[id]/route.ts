/**
 * Admin approval or rejection of a pending instance request.
 */
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { provisionInstance } from '@/lib/core/provision';
import { logAudit } from '@/lib/services/audit';
import { notify } from '@/lib/services/notify';
import { jsonBody } from '@/lib/api';
import { z } from 'zod';


type Ctx = { params: Promise<{ id: string }> };

type RequestRow = {
  id: string; user_id: string; name: string; plan_id: string;
  image_id: string | null; status: string;
};

type ReviewBody = z.infer<typeof reviewBodySchema>;
const reviewBodySchema = z.object({
  op: z.string().optional(), note: z.string().optional(),
  planId: z.string().optional(), imageId: z.string().optional(),
}).passthrough();

function reviewNote(body: ReviewBody) {
  return (body.note ?? '').trim().slice(0, 280) || null;
}

async function reject(requestRow: RequestRow, admin: { id: string; name: string }, body: ReviewBody) {
  rawDb().prepare(`update instance_requests set status='rejected', reviewed_by=?, reviewed_at=?, review_note=? where id=?`).run(
    admin.id, now(), reviewNote(body), requestRow.id);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'instance.request.reject', target: requestRow.id });
  notify(requestRow.user_id, 'warn', `request "${requestRow.name}" rejected`, reviewNote(body) ?? '', '/instances');
  return json({ ok: true, status: 'rejected' });
}

async function approve(requestRow: RequestRow, id: string, admin: { id: string; name: string }, body: ReviewBody) {
  // approve -> provision
  const [userRow] = await getDb().select().from(users).where(eq(users.id, requestRow.user_id));
  if (!userRow) return err('user gone', 404);
  try {
    const inst = await provisionInstance({
      userId: requestRow.user_id, name: requestRow.name,
      planId: body.planId ?? requestRow.plan_id,
      imageId: body.imageId ?? (requestRow.image_id ?? undefined),
      actorName: admin.name, actorRole: 'admin',
      // Quota counts pending requests as reservations. Exclude THIS one or the
      // approval counts its own request against itself and refuses a request
      // that exactly fits the user's quota.
      excludeRequestId: id,
    });
    rawDb().prepare(`update instance_requests set status='approved', reviewed_by=?, reviewed_at=?, result_instance_id=?, review_note=? where id=?`).run(
      admin.id, now(), inst.id, reviewNote(body), id);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'instance.request.approve', target: id, detail: { instanceId: inst.id } });
    notify(requestRow.user_id, 'ok', `request "${requestRow.name}" approved`, 'provisioning started', `/instances/${inst.id}`);
    return json({ ok: true, status: 'approved', instanceId: inst.id });
  } catch (error) {
    return err((error as Error).message || 'provision failed', 400);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const raw = rawDb();
  const requestRow = raw.prepare(`select * from instance_requests where id=?`).get(id) as RequestRow | undefined;
  if (!requestRow) return err('not found', 404);
  if (requestRow.status !== 'pending') return err('request already reviewed', 409);

  const body = await jsonBody(req, reviewBodySchema);
  if (body.op === 'reject') return reject(requestRow, admin, body);
  if (body.op === 'approve') return approve(requestRow, id, admin, body);
  return err('op must be approve|reject');
}

export const dynamic = 'force-dynamic';
