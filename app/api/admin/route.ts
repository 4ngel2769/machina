import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { users, plans, images, instances, audit } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { grantCents } from '@/lib/core/metering';
import { grantDefaultQuota } from '@/lib/core/quota';
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
  // Counts come along so the delete button can refuse before it is pressed
  // rather than after: an account with instances must have them destroyed
  // first, and the UI should say so on the row, not in an error toast.
  const userRows = rd0.prepare(
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
    name?: string; password?: string; role?: string; creditCents?: number;
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
      if (!body.password || body.password.length < 8) return err('password min 8 chars (72 is bcrypt cap)');
      if (body.password.length > 72) return err('password min 8 chars (72 is bcrypt cap)');
      if (rawDb().prepare(`select 1 from users where name=?`).get(name)) return err('name taken', 409);
      const role = body.role === 'admin' ? 'admin' : 'user';
      // Opening credit. Defaults to config.limits.defaultBalanceCents (0), never
      // to something generous: a new account starts unfunded until an admin
      // decides otherwise. A negative or nonsense figure is a client bug.
      const credit = body.creditCents === undefined ? config.limits.defaultBalanceCents : body.creditCents;
      if (!Number.isInteger(credit) || credit < 0) return err('creditCents must be a whole number of cents >= 0');

      const id = newId('usr_');
      const rd = rawDb();
      rd.transaction(() => {
        rd.prepare(`insert into users (id,name,role,password_hash,balance_cents,created_at) values (?,?,?,?,?,?)`)
          .run(id, name, role, hashPassword(body.password as string), credit, now());
        if (credit > 0) {
          rd.prepare(`insert into ledger (id,user_id,delta_cents,reason,ref_type,ref_id,note,created_at)
            values (?,?,?,?,?,?,?,?)`)
            .run(newId('led_'), id, credit, 'grant', 'admin', admin.id, `opening allocation by ${admin.name}`, now());
        }
      })();
      // Provisioned but not permitted: zero of everything until an admin sets a
      // real quota. Insert-only, so it cannot clobber a later admin edit.
      grantDefaultQuota(id);
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.createUser',
        target: name, detail: { id, role, creditCents: credit } });
      return json({ ok: true, id, name, role, balanceCents: credit }, 201);
    }
    case 'setPassword': {
      if (!body.userId) return err('userId required');
      const pw = body.password ?? '';
      if (pw.length < 8 || pw.length > 72) return err('password: 8-72 chars (72 is bcrypt cap)');
      const u = await getDb().select().from(users).where(eq(users.id, body.userId));
      if (!u[0]) return err('user not found', 404);
      await getDb().update(users).set({ passwordHash: hashPassword(pw) }).where(eq(users.id, body.userId));
      // Existing sessions are JWTs and stay valid until they expire; this only
      // changes what the login form accepts from here on.
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setPassword', target: u[0].name });
      return json({ ok: true });
    }
    case 'setRole': {
      if (!body.userId) return err('userId required');
      const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
      if (!role) return err('role must be admin or user');
      const u = await getDb().select().from(users).where(eq(users.id, body.userId));
      if (!u[0]) return err('user not found', 404);
      // Do not let an admin lock themselves (or the last admin) out of the
      // panel: demoting the final admin is unrecoverable from the UI.
      if (u[0].role === 'admin' && role === 'user') {
        if (u[0].id === admin.id) return err('you cannot demote your own account', 409);
        const admins = (rawDb().prepare(`select count(*) c from users where role='admin'`).get() as { c: number }).c;
        if (admins <= 1) return err('this is the last admin account', 409);
      }
      if (u[0].role === role) return json({ ok: true, role });
      await getDb().update(users).set({ role }).where(eq(users.id, body.userId));
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.setRole',
        target: u[0].name, detail: { from: u[0].role, to: role } });
      return json({ ok: true, role });
    }
    case 'deleteUser': {
      if (!body.userId) return err('userId required');
      if (body.userId === admin.id) return err('you cannot delete your own account', 409);
      const u = await getDb().select().from(users).where(eq(users.id, body.userId));
      if (!u[0]) return err('user not found', 404);
      const owned = (rawDb().prepare(`select count(*) c from instances where user_id=?`).get(body.userId) as { c: number }).c;
      if (owned > 0) {
        // Deleting the account would strand qcow2 overlays, leases and VNC
        // sockets with no owner to bill or blame. Make the admin destroy the
        // instances first, where each destroy goes through the normal handler.
        return err(`${u[0].name} still owns ${owned} instance${owned === 1 ? '' : 's'} — delete ${owned === 1 ? 'it' : 'them'} first`, 409);
      }
      if (u[0].role === 'admin') {
        const admins = (rawDb().prepare(`select count(*) c from users where role='admin'`).get() as { c: number }).c;
        if (admins <= 1) return err('this is the last admin account', 409);
      }
      const rd = rawDb();
      const id = body.userId;
      rd.transaction(() => {
        // Instances are gone (checked above); sweep everything else that keys
        // off the account so a later id collision cannot inherit its history.
        rd.prepare(`delete from ssh_keys where user_id=?`).run(id);
        rd.prepare(`delete from quotas where user_id=?`).run(id);
        rd.prepare(`delete from instance_requests where user_id=?`).run(id);
        rd.prepare(`delete from deletion_requests where user_id=?`).run(id);
        rd.prepare(`delete from jobs where user_id=?`).run(id);
        // Ledger rows stay: they are the money trail, and an audit that can be
        // erased by deleting the account is not an audit.
        rd.prepare(`delete from users where id=?`).run(id);
      })();
      await logAudit({ actorId: admin.id, actorName: admin.name, action: 'admin.deleteUser', target: u[0].name, detail: { id } });
      return json({ ok: true });
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
