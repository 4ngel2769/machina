/** Instance ops: createInstance (preset plan) and createCustomInstance (hand-built spec). */

import { getDb, rawDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { json, err } from '@/lib/api';
import { provisionInstance } from '@/lib/core/provision';
import { validateCustomSpec, createCustomPlan, deleteCustomPlan } from '@/lib/core/plans';
import { logAudit } from '@/lib/services/audit';
import type { NextResponse } from 'next/server';
import type { AdminBody, AdminCtx } from './types';

type CreateTarget = { targetUserId: string; name: string; planId: string };

/** Validate the admin create body before touching the database. */
function validateCreateTarget(body: AdminBody): CreateTarget | NextResponse {
  if (!body.targetUserId) return err('targetUserId required');
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  return { targetUserId: body.targetUserId, name, planId: body.planId || 'micro' };
}

/**
 * Admin create for a preset plan. The target user's quota still applies; an
 * admin bypasses no guard except the one that decides who may ask. The old
 * inline insert put these VMs on the legacy shared net and skipped quota,
 * balance and host-capacity checks entirely.
 */
export async function createInstance(body: AdminBody, { admin }: AdminCtx) {
  const target = validateCreateTarget(body);
  if (target instanceof Response) return target;

  const [targetUser] = await getDb().select().from(users).where(eq(users.id, target.targetUserId));
  if (!targetUser) return err('target user not found', 404);
  const imageId = body.imageId || targetUser.assignedImageId || undefined;

  let created: { id: string; name: string; ip: string };
  try {
    created = await provisionInstance({
      userId: targetUser.id,
      name: target.name,
      planId: target.planId,
      actorName: admin.name,
      actorRole: 'admin',
      ...(imageId ? { imageId } : {}),
    });
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error), 400);
  }

  await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createInstance',
    target: created.id, detail: { forUser: targetUser.name, planId: target.planId, imageId: body.imageId ?? null } });
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
