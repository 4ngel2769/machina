/** Instance ops: createInstance (preset plan) and createCustomInstance (hand-built spec). */

import { getDb, rawDb } from '@/lib/db';
import { users, plans, images, instances } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { json, err } from '@/lib/api';
import { newInstanceId, now } from '@/lib/core/util';
import { macFromId, IpAllocator } from '@/lib/core/driver';
import { encrypt, randPassword, randToken } from '@/lib/core/crypto';
import { config } from '@/lib/config';
import { enqueue } from '@/lib/core/jobs';
import { provisionInstance } from '@/lib/core/provision';
import { validateCustomSpec, createCustomPlan, deleteCustomPlan } from '@/lib/core/plans';
import { logAudit } from '@/lib/services/audit';
import type { AdminBody, AdminCtx } from './types';

/** The plan, image and IP an admin create needs, or the refusal. */
async function resolveCreateTarget(body: AdminBody) {
  if (!body.targetUserId) return err('targetUserId required');
  if (!body.name) return err('name required');
  const [targetUser] = await getDb().select().from(users).where(eq(users.id, body.targetUserId));
  if (!targetUser) return err('target user not found', 404);
  const planId = body.planId || 'micro';
  const [plan] = await getDb().select().from(plans).where(and(eq(plans.id, planId), eq(plans.active, 1)));
  if (!plan) return err('plan invalid', 400);
  const imageId = body.imageId || targetUser.assignedImageId || 'ubuntu-24.04';
  const [image] = await getDb().select().from(images).where(eq(images.id, imageId));
  if (!image || image.status !== 'ready') return err('image not ready', 400);
  return { targetUser, plan, image };
}

/** Name checks plus the provisioning row insert; returns the row id or a refusal. */
async function insertProvisioning(body: AdminBody, targetUser: { id: string }, plan: { id: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; monthlyCapMin: number; bandwidthGb: number | null }, image: { id: string }) {
  const raw = rawDb();
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  const dupe = raw.prepare(`select 1 from instances where user_id=? and name=?`).get(targetUser.id, name);
  if (dupe) return err('name already used', 409);
  const taken = (raw.prepare(`select ip from instances where ip is not null`).all() as { ip: string }[]).map((row) => row.ip);
  const id = newInstanceId();
  const ip = new IpAllocator(taken).next();
  if (!ip) return err('no free IP in range', 503);
  const rootPassword = randPassword();
  const vncPass = randToken(4).slice(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
  await getDb().insert(instances).values({
    id,
    domainName: `machina-${id.slice(3, 16)}`,
    userId: targetUser.id,
    planId: plan.id,
    imageId: image.id,
    name,
    status: 'provisioning',
    mac: macFromId(id),
    ip,
    vncSocket: `${config.storageDir}/vnc/${id}.vnc`,
    vncPass,
    rootPassEnc: encrypt(rootPassword),
    rateHourlyCents: plan.hourlyRateCents,
    monthlyCapMin: plan.monthlyCapMin,
    bandwidthGb: plan.bandwidthGb ?? 0,
    createdAt: now(),
    updatedAt: now(),
  });
  const jobId = await enqueue({ type: 'instance.create', instanceId: id, userId: targetUser.id,
    payload: { planSnapshot: { vcpu: plan.vcpu, ramMb: plan.ramMb, diskGb: plan.diskGb } } });
  return { id, jobId, ip, name };
}

export async function createInstance(body: AdminBody, { admin }: AdminCtx) {
  // Admin creates an instance for a target user.
  const target = await resolveCreateTarget(body);
  if (target instanceof Response) return target;
  const { targetUser, plan, image } = target;
  const created = await insertProvisioning(body, targetUser, plan, image);
  if (created instanceof Response) return created;
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createInstance',
    target: created.id, detail: { forUser: targetUser.name, planId: plan.id, imageId: image.id } });
  return json({ ...created, status: 'provisioning' }, 201);
}

export async function createCustomInstance(body: AdminBody, { admin }: AdminCtx) {
  // A hand-built VM: no preset involved. The spec is materialised as a
  // custom plan row so the rest of the system (quota sums, domain XML,
  // overlay size, billing rate, monthly cap, bandwidth) reads it exactly
  // the way it reads any other plan. Provisioning then goes through the
  // SAME funnel as everything else — an admin bypasses the user's quota,
  // never the host's capacity.
  if (!body.targetUserId) return err('targetUserId required');
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  const [targetUser] = await getDb().select().from(users).where(eq(users.id, body.targetUserId));
  if (!targetUser) return err('target user not found', 404);

  let spec;
  try {
    spec = validateCustomSpec(body as Record<string, unknown>);
  } catch (error) {
    return err((error as Error).message);
  }

  const plan = await createCustomPlan(spec);
  try {
    const created = await provisionInstance({
      userId: targetUser.id,
      name,
      planId: plan.id,
      imageId: body.imageId || undefined,
      actorName: admin.name,
      actorRole: 'admin',
    });
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createCustom',
      target: created.id,
      detail: { forUser: targetUser.name, planId: plan.id, vcpu: plan.vcpu, ramMb: plan.ramMb,
        diskGb: plan.diskGb, bandwidthGb: plan.bandwidthGb, rateHourlyCents: plan.hourlyRateCents } });
    return json({ id: created.id, name: created.name, ip: created.ip, planId: plan.id,
      rateHourlyCents: plan.hourlyRateCents, status: 'provisioning' }, 201);
  } catch (error) {
    // Nothing was created, so the plan row it would have used is dead
    // weight in the plan list. Remove it; the error explains the refusal.
    await deleteCustomPlan(plan.id);
    return err((error as Error).message, 400);
  }
}

export async function deletePlan(body: AdminBody, { admin }: AdminCtx) {
  // Custom plans are one-off sizes; the plan they replaced stays in the
  // table forever otherwise. Catalog tiers are never deletable this way.
  if (!body.planId) return err('planId required');
  const planRow = (rawDb().prepare(`select id, name, custom from plans where id=?`).get(body.planId) as
    { id: string; name: string; custom: number } | undefined);
  if (!planRow) return err('plan not found', 404);
  if (!planRow.custom) return err('that is a catalog tier, not a custom plan', 409);
  const used = (rawDb().prepare(`select count(*) c from instances where plan_id=?`).get(planRow.id) as { c: number }).c;
  if (used > 0) return err(`${used} instance${used === 1 ? '' : 's'} still use this plan — move them first`, 409);
  const pending = (rawDb().prepare(`select count(*) c from instance_requests where plan_id=? and status='pending'`).get(planRow.id) as { c: number }).c;
  if (pending > 0) return err(`${pending} pending request${pending === 1 ? '' : 's'} still reference it`, 409);
  await deleteCustomPlan(planRow.id);
  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.deletePlan', target: planRow.id, detail: { name: planRow.name } });
  return json({ ok: true });
}
