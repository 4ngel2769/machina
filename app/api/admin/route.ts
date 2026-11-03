import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { users, plans, images, instances, audit } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { grantCents } from '@/lib/core/metering';
import { newId, hashPassword } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';
import { config } from '@/lib/config';
import { enqueue } from '@/lib/core/jobs';
import { logAudit } from '@/lib/services/audit';
import { syncState } from '@/lib/core/images';

export async function GET(req: NextRequest) {
  const g = await requireAdmin();
  if (!g[0]) return g[1];
  const limit = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0));
  const rd0 = rawDb();
  const auditTotal = (rd0.prepare(`select count(*) c from audit`).get() as { c: number }).c;
  return json({
    users: await getDb().select({
      id: users.id, name: users.name, role: users.role,
      balanceCents: users.balanceCents, createdAt: users.createdAt,
      imagePickable: users.imagePickable, assignedImageId: users.assignedImageId,
    }).from(users).orderBy(desc(users.createdAt)),
    plans: await getDb().select().from(plans),
    images: await getDb().select().from(images),
    audit: await getDb().select().from(audit).orderBy(desc(audit.ts)).limit(limit).offset(offset),
    auditTotal,
    syncing: [...syncState.keys()],
  });
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const g2 = await requireAdmin();
  if (!g2[0]) return g2[1];
  const admin = g2[0];
  const body = (await req.json().catch(() => ({}))) as {
    op?: string; userId?: string; deltaCents?: number;
    name?: string; password?: string; role?: string;
    planId?: string; vcpu?: number; ramMb?: number; diskGb?: number; hourlyRateCents?: number; monthlyCapMin?: number; bandwidthGb?: number;
    imageId?: string; targetUserId?: string;
    imagePickable?: boolean; assignedImageId?: string | null;
  };
  switch (body.op) {
    case 'topup': {
      if (!body.userId || typeof body.deltaCents !== 'number' || !Number.isInteger(body.deltaCents)) {
        return err('userId and integer deltaCents required');
      }
      grantCents(body.userId, body.deltaCents, `admin top-up by ${admin.name}`);
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.topup',
        target: body.userId, detail: { deltaCents: body.deltaCents } });
      return json({ ok: true });
    }
    case 'createUser': {
      const name = (body.name ?? '').trim();
      if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
      if (!body.password || body.password.length < 6) return err('password min 6 chars');
      if (rawDb().prepare(`select 1 from users where name=?`).get(name)) return err('name taken', 409);
      rawDb().prepare(`insert into users (id,name,role,password_hash,balance_cents,created_at) values (?,?,?,?,0,?)`)
        .run(newId('usr_'), name, body.role === 'admin' ? 'admin' : 'user', hashPassword(body.password), now());
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createUser', target: name });
      return json({ ok: true }, 201);
    }
    case 'setPlan': {
      if (!body.planId) return err('planId required');
      const p = await getDb().select().from(plans).where(eq(plans.id, body.planId));
      if (!p[0]) return err('plan not found', 404);
      await getDb().update(plans).set({
        vcpu: body.vcpu ?? p[0].vcpu,
        ramMb: body.ramMb ?? p[0].ramMb,
        diskGb: body.diskGb ?? p[0].diskGb,
        hourlyRateCents: body.hourlyRateCents ?? p[0].hourlyRateCents,
        monthlyCapMin: body.monthlyCapMin ?? p[0].monthlyCapMin,
        bandwidthGb: body.bandwidthGb ?? p[0].bandwidthGb,
      }).where(eq(plans.id, body.planId));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setPlan', target: body.planId });
      return json({ ok: true });
    }
    case 'setUserImage': {
      if (!body.userId) return err('userId required');
      const u = await getDb().select().from(users).where(eq(users.id, body.userId));
      if (!u[0]) return err('user not found', 404);
      const pickable = body.imagePickable === undefined ? u[0].imagePickable : (body.imagePickable ? 1 : 0);
      const assigned = body.assignedImageId === undefined ? u[0].assignedImageId : (body.assignedImageId || null);
      if (assigned) {
        const img = await getDb().select().from(images).where(eq(images.id, assigned));
        if (!img[0]) return err('image not found', 404);
      }
      await getDb().update(users).set({
        imagePickable: pickable,
        assignedImageId: assigned,
      }).where(eq(users.id, body.userId));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setUserImage',
        target: body.userId, detail: { imagePickable: !!pickable, assignedImageId: assigned } });
      return json({ ok: true });
    }
    case 'createInstance': {
      // Admin creates an instance for a target user.
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
      const rd = rawDb();
      const name = body.name.trim();
      if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
      const dupe = rd.prepare(`select 1 from instances where user_id=? and name=?`).get(targetUser.id, name);
      if (dupe) return err('name already used', 409);
      const taken = (rd.prepare(`select ip from instances where ip is not null`).all() as { ip: string }[]).map((r) => r.ip);
      const { newInstanceId, macFromId, IpAllocator } = await import('@/lib/core/util').then(async (u) => {
        const { macFromId: m, IpAllocator: a } = await import('@/lib/core/driver');
        return { newInstanceId: u.newInstanceId, macFromId: m, IpAllocator: a };
      });
      const { encrypt, randPassword, randToken } = await import('@/lib/core/crypto');
      const id = newInstanceId();
      const ip = new IpAllocator(taken).next();
      if (!ip) return err('no free IP in range', 503);
      const rootPassword = randPassword();
      const vncPass = randToken(4).slice(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
      const { now } = await import('@/lib/core/util');
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
      const { enqueue } = await import('@/lib/core/jobs');
      const jobId = await enqueue({ type: 'instance.create', instanceId: id, userId: targetUser.id,
        payload: { planSnapshot: { vcpu: plan.vcpu, ramMb: plan.ramMb, diskGb: plan.diskGb } } });
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createInstance',
        target: id, detail: { forUser: targetUser.name, planId: plan.id, imageId: image.id } });
      return json({ id, jobId, ip, name, status: 'provisioning' }, 201);
    }
    case 'syncImage': {
      if (!body.imageId) return err('imageId required');
      await enqueue({ type: 'image.sync', payload: { imageId: body.imageId } });
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.imageSync', target: body.imageId });
      return json({ ok: true, note: 'sync job queued' });
    }
    default:
      return err('unknown op');
  }
}
