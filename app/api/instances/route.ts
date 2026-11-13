/**
 * Instance list and create for the signed-in user.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances, plans, images, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { enqueue } from '@/lib/core/jobs';
import { newInstanceId, now } from '@/lib/core/util';
import { encrypt, newId, randToken, randPassword, rateLimit } from '@/lib/core/crypto';
import { config } from '@/lib/config';
import { macFromId, IpAllocator } from '@/lib/core/driver';
import { provisionInstance } from '@/lib/core/provision';
import { logAudit } from '@/lib/services/audit';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const db = getDb();
  // Specs come off the joined plan, not off the catalog: a custom plan is
  // deliberately absent from the catalog, so reading sizes from there left
  // custom boxes rendering "undefined vCPU · undefined MB RAM".
  const cols = {
    id: instances.id, domainName: instances.domainName, userId: instances.userId,
    planId: instances.planId, imageId: instances.imageId, name: instances.name,
    rateHourlyCents: instances.rateHourlyCents, monthlyCapMin: instances.monthlyCapMin,
    bandwidthGb: instances.bandwidthGb, status: instances.status, mac: instances.mac,
    ip: instances.ip, vncSocket: instances.vncSocket, autoSuspended: instances.autoSuspended,
    healCount: instances.healCount, destroyAt: instances.destroyAt,
    lastSettleAt: instances.lastSettleAt, createdAt: instances.createdAt,
    updatedAt: instances.updatedAt, notes: instances.notes,
    planName: plans.name, vcpu: plans.vcpu, ramMb: plans.ramMb, diskGb: plans.diskGb,
    custom: plans.custom,
  };
  const rows = user.role === 'admin'
    ? await db.select(cols).from(instances).innerJoin(plans, eq(plans.id, instances.planId))
      .orderBy(desc(instances.createdAt))
    : await db.select(cols).from(instances).innerJoin(plans, eq(plans.id, instances.planId))
      .where(eq(instances.userId, user.id)).orderBy(desc(instances.createdAt));
  const jobs = rawDb().prepare(`select instance_id, status, type from jobs
     where status in ('queued','running')`).all() as { instance_id: string; status: string; type: string }[];
  return json(rows.map((row) => ({
    ...row,
    activeJob: jobs.find((job) => job.instance_id === row.id) ?? null,
  })));
}

/** Provision: validate + reserve (row, ip, plan copy) then enqueue create. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const denied = guardMutation(req);
  if (denied) return denied;
  // Non-admin users must REQUEST an instance (admin approves). Direct create
  // is admin-only to enforce the approval gate.
  if (user.role !== 'admin') {
    return err('request an instance via /api/requests (admin approval required)', 403);
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string; planId?: string; imageId?: string;
  };
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  if (!rateLimit(`create:${user.id}`, 10, 10 * 60_000)) return err('too many creations; slow down', 429);

  try {
    const created = await provisionInstance({
      userId: user.id, name, planId: body.planId ?? '', imageId: body.imageId,
      actorName: user.name, actorRole: user.role,
    });
    return json({ id: created.id, ip: created.ip, name: created.name, status: 'provisioning' }, 201);
  } catch (error) {
    return err((error as Error).message || 'create failed', 400);
  }
}

export const dynamic = 'force-dynamic';
