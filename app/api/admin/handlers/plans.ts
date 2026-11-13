/** Plan and image ops: setPlan, setUserImage, syncImage. */

import { getDb } from '@/lib/db';
import { users, plans, images } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { json, err } from '@/lib/api';
import { enqueue } from '@/lib/core/jobs';
import { logAudit } from '@/lib/services/audit';
import type { AdminBody, AdminCtx } from './types';

export async function setPlan(body: AdminBody, { admin }: AdminCtx) {
  if (!body.planId) return err('planId required');
  const planRows = await getDb().select().from(plans).where(eq(plans.id, body.planId));
  if (!planRows[0]) return err('plan not found', 404);
  await getDb().update(plans).set({
    vcpu: body.vcpu ?? planRows[0].vcpu,
    ramMb: body.ramMb ?? planRows[0].ramMb,
    diskGb: body.diskGb ?? planRows[0].diskGb,
    hourlyRateCents: body.hourlyRateCents ?? planRows[0].hourlyRateCents,
    monthlyCapMin: body.monthlyCapMin ?? planRows[0].monthlyCapMin,
    bandwidthGb: body.bandwidthGb ?? planRows[0].bandwidthGb,
  }).where(eq(plans.id, body.planId));
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setPlan', target: body.planId });
  return json({ ok: true });
}

export async function setUserImage(body: AdminBody, { admin }: AdminCtx) {
  if (!body.userId) return err('userId required');
  const userRows = await getDb().select().from(users).where(eq(users.id, body.userId));
  if (!userRows[0]) return err('user not found', 404);
  const pickable = body.imagePickable === undefined ? userRows[0].imagePickable : (body.imagePickable ? 1 : 0);
  const assigned = body.assignedImageId === undefined ? userRows[0].assignedImageId : (body.assignedImageId || null);
  if (assigned) {
    const imageRows = await getDb().select().from(images).where(eq(images.id, assigned));
    if (!imageRows[0]) return err('image not found', 404);
  }
  await getDb().update(users).set({
    imagePickable: pickable,
    assignedImageId: assigned,
  }).where(eq(users.id, body.userId));
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setUserImage',
    target: body.userId, detail: { imagePickable: !!pickable, assignedImageId: assigned } });
  return json({ ok: true });
}

export async function syncImage(body: AdminBody, { admin }: AdminCtx) {
  if (!body.imageId) return err('imageId required');
  await enqueue({ type: 'image.sync', payload: { imageId: body.imageId } });
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.imageSync', target: body.imageId });
  return json({ ok: true, note: 'sync job queued' });
}
