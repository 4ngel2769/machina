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
  const rows = user.role === 'admin'
    ? await db.select().from(instances).orderBy(desc(instances.createdAt))
    : await db.select().from(instances).where(eq(instances.userId, user.id)).orderBy(desc(instances.createdAt));
  const jobs = rawDb().prepare(`select instance_id, status, type from jobs
     where status in ('queued','running')`).all() as { instance_id: string; status: string; type: string }[];
  return json(rows.map((r) => ({
    ...r,
    rootPassEnc: undefined,
    vncPass: undefined,
    activeJob: jobs.find((j) => j.instance_id === r.id) ?? null,
  })));
}

/** Provision: validate + reserve (row, ip, plan copy) then enqueue create. */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const originErr = guardMutation(req);
  if (originErr) return originErr;
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
    const r = await provisionInstance({
      userId: user.id, name, planId: body.planId ?? '', imageId: body.imageId,
      actorName: user.name, actorRole: user.role,
    });
    return json({ id: r.id, ip: r.ip, name: r.name, status: 'provisioning' }, 201);
  } catch (e) {
    return err((e as Error).message || 'create failed', 400);
  }
}

export const dynamic = 'force-dynamic';
