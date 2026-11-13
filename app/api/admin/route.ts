/**
 * Admin API: user, plan, image, quota and request operations behind an admin session.
 */
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { plans, images, instances, audit } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { syncState } from '@/lib/core/images';
import { createUser, deleteUser, setPassword, setRole, topup } from './handlers/users';
import { createCustomInstance, createInstance, deletePlan } from './handlers/instances';
import { setPlan, setUserImage as setUserImageOp, syncImage as syncImageOp } from './handlers/plans';
import type { AdminBody, OpHandler } from './handlers/types';

export async function GET(req: NextRequest) {
  const { user: adminUser, response: authError } = await requireAdmin();
  if (!adminUser) return authError;
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const raw = rawDb();
  const auditTotal = (raw.prepare(`select count(*) c from audit`).get() as { c: number }).c;
  // Per-plan instance counts: a custom plan is a one-off and is safe to drop
  // only while nothing references it (the instance list inner-joins plans, so a
  // dangling plan_id would hide the VM from its own owner).
  const planUsage: Record<string, number> = {};
  for (const planRow of raw.prepare(`select plan_id, count(*) c from instances group by plan_id`).all() as
    { plan_id: string; c: number }[]) planUsage[planRow.plan_id] = planRow.c;
  // Counts come along so the delete button can refuse before it is pressed
  // rather than after: an account with instances must have them destroyed
  // first, and the UI should say so on the row, not in an error toast.
  const userRows = raw.prepare(
    `select u.id, u.name, u.role,
            u.balance_cents as balanceCents, u.created_at as createdAt,
            u.image_pickable as imagePickable, u.assigned_image_id as assignedImageId,
            (select count(*) from instances i where i.user_id = u.id) as instanceCount,
            (select count(*) from ssh_keys k where k.user_id = u.id) as keyCount
     from users u order by u.created_at desc`,
  ).all() as {
    id: string; name: string; role: string; balanceCents: number; createdAt: number;
    imagePickable: number; assignedImageId: string | null; instanceCount: number; keyCount: number;
  }[];
  return json({
    users: userRows,
    plans: await getDb().select().from(plans),
    planUsage,
    images: await getDb().select().from(images),
    audit: await getDb().select().from(audit).orderBy(desc(audit.ts)).limit(limit).offset(offset),
    auditTotal,
    syncing: [...syncState.keys()],
  });
}

const OPS: Record<string, OpHandler> = {
  topup,
  createUser,
  setPassword,
  setRole,
  deleteUser,
  setPlan,
  setUserImage: setUserImageOp,
  createInstance,
  createCustomInstance,
  deletePlan,
  syncImage: syncImageOp,
};

export async function POST(req: NextRequest) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const { user: admin, response: authError } = await requireAdmin();
  if (!admin) return authError;
  const body = (await req.json().catch(() => ({}))) as AdminBody;
  const op = body.op ? OPS[body.op] : undefined;
  if (!op) return err('unknown op');
  return op(body, { admin });
}
