import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { provisionInstance } from '@/lib/core/provision';
import { logAudit } from '@/lib/services/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const [admin, e] = await requireAdmin();
  if (e) return e;
  const { id } = await ctx.params;
  const rd = rawDb();
  const r = rd.prepare(`select * from instance_requests where id=?`).get(id) as
    | { id: string; user_id: string; name: string; plan_id: string; image_id: string | null; status: string } | undefined;
  if (!r) return err('not found', 404);
  if (r.status !== 'pending') return err('request already reviewed', 409);

  const body = (await req.json().catch(() => ({}))) as { op?: string; note?: string; planId?: string; imageId?: string };
  const op = body.op === 'approve' ? 'approve' : body.op === 'reject' ? 'reject' : null;
  if (!op) return err('op must be approve|reject');

  if (op === 'reject') {
    rawDb().prepare(`update instance_requests set status='rejected', reviewed_by=?, reviewed_at=?, review_note=? where id=?`).run(
      admin.id, now(), (body.note ?? '').trim().slice(0, 280) || null, id);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'instance.request.reject', target: id });
    return json({ ok: true, status: 'rejected' });
  }

  // approve -> provision
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, r.user_id));
  if (!u) return err('user gone', 404);
  try {
    const inst = await provisionInstance({
      userId: r.user_id, name: r.name,
      planId: body.planId ?? r.plan_id,
      imageId: body.imageId ?? (r.image_id ?? undefined),
      actorName: admin.name, actorRole: 'admin',
      // Quota counts pending requests as reservations. Exclude THIS one or the
      // approval counts its own request against itself and refuses a request
      // that exactly fits the user's quota.
      excludeRequestId: id,
    });
    rawDb().prepare(`update instance_requests set status='approved', reviewed_by=?, reviewed_at=?, result_instance_id=?, review_note=? where id=?`).run(
      admin.id, now(), inst.id, (body.note ?? '').trim().slice(0, 280) || null, id);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'instance.request.approve', target: id, detail: { instanceId: inst.id } });
    return json({ ok: true, status: 'approved', instanceId: inst.id });
  } catch (e) {
    return err((e as Error).message || 'provision failed', 400);
  }
}

export const dynamic = 'force-dynamic';
