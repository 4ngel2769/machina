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

/** Put a failed review back in the queue. A row already approved or rejected
 *  is untouched, so a late audit failure cannot undo a committed provision. */
function releaseClaim(id: string): void {
  rawDb().prepare(`update instance_requests set status='pending', reviewed_by=null, reviewed_at=null where id=? and status='reviewing'`).run(id);
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
  if (!userRow) {
    releaseClaim(id);
    return err('user gone', 404);
  }
  let inst: { id: string; name: string; ip: string };
  try {
    inst = await provisionInstance({
      userId: requestRow.user_id, name: requestRow.name,
      planId: body.planId ?? requestRow.plan_id,
      imageId: body.imageId ?? (requestRow.image_id ?? undefined),
      actorName: admin.name, actorRole: 'admin',
      // Quota counts pending requests as reservations. Exclude THIS one or the
      // approval counts its own request against itself and refuses a request
      // that exactly fits the user's quota.
      excludeRequestId: id,
    });
  } catch (error) {
    releaseClaim(id);
    return err(error instanceof Error ? error.message : String(error), 400);
  }
  rawDb().prepare(`update instance_requests set status='approved', reviewed_by=?, reviewed_at=?, result_instance_id=?, review_note=? where id=?`).run(
    admin.id, now(), inst.id, reviewNote(body), id);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'instance.request.approve', target: id, detail: { instanceId: inst.id } });
  notify(requestRow.user_id, 'ok', `request "${requestRow.name}" approved`, 'provisioning started', `/instances/${inst.id}`);
  return json({ ok: true, status: 'approved', instanceId: inst.id });
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
  if (body.op !== 'approve' && body.op !== 'reject') return err('op must be approve|reject');

  // Claim before any await inside approve/reject. The conditional UPDATE is
  // the only arbiter: a second admin loses the race here instead of
  // provisioning and billing the same request twice.
  const claim = raw.prepare(`update instance_requests set status='reviewing', reviewed_by=?, reviewed_at=? where id=? and status='pending'`).run(admin.id, now(), id);
  if (claim.changes !== 1) return err('request already reviewed', 409);

  let result: Response;
  try {
    result = body.op === 'reject'
      ? await reject(requestRow, admin, body)
      : await approve(requestRow, id, admin, body);
  } catch (error) {
    releaseClaim(id);
    throw error;
  }
  return result;
}

export const dynamic = 'force-dynamic';
