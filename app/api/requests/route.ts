import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { users, plans, images } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { now } from '@/lib/core/util';
import { newId } from '@/lib/core/crypto';
import { rateLimit } from '@/lib/core/crypto';
import { logAudit } from '@/lib/services/audit';
import { checkQuota } from '@/lib/core/quota';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const rd = rawDb();
  const rows = user.role === 'admin'
    ? rd.prepare(`select * from instance_requests order by created_at desc`).all()
    : rd.prepare(`select * from instance_requests where user_id=? order by created_at desc`).all(user.id);
  return json(rows);
}

export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  if (user.role === 'admin') return err('admins create directly via /api/instances', 400);
  if (!rateLimit(`req:${user.id}`, 5, 60 * 60_000)) return err('too many requests; slow down', 429);

  const body = (await req.json().catch(() => ({}))) as { name?: string; planId?: string; imageId?: string; note?: string };
  const name = (body.name ?? '').trim();
  if (!/^[a-z0-9-]{3,32}$/.test(name)) return err('name: 3-32 chars of a-z 0-9 -');
  const [plan] = await getDb().select().from(plans).where(eq(plans.id, body.planId ?? ''));
  if (!plan || !plan.active) return err('plan invalid', 400);

  // OS choice. A picker exists now, so the image is explicit rather than left
  // to a fallback at approval time — but the rule that a user without
  // image-pickable rights cannot choose still holds, enforced HERE and not only
  // in the UI, because the UI is not a security boundary.
  const [dbUser] = await getDb()
    .select({ imagePickable: users.imagePickable, assignedImageId: users.assignedImageId })
    .from(users)
    .where(eq(users.id, user.id));
  let imageId = '';
  if (dbUser && !dbUser.imagePickable) {
    // Admin-assigned OS. A user-supplied imageId is ignored outright rather than
    // rejected, so a stale client cannot turn a working request into an error.
    imageId = dbUser.assignedImageId ?? '';
    if (!imageId) return err('no OS is assigned to your account yet — ask an admin');
    // Validate the ASSIGNED image too. Otherwise the request is accepted, the
    // admin approves it months later, and provisioning dies on an image that was
    // never going to boot — the user's fault for a host problem.
    const [assigned] = await getDb().select().from(images).where(eq(images.id, imageId));
    if (!assigned) return err('the OS assigned to your account is missing — ask an admin');
    if (assigned.status !== 'ready') {
      return err(assigned.status === 'broken'
        ? `the OS assigned to your account (${assigned.name}) is unavailable on this host — ask an admin to assign another`
        : `the OS assigned to your account (${assigned.name}) is still ${assigned.status} — try again shortly`, 400);
    }
  } else {
    imageId = (body.imageId ?? '').trim();
    if (imageId) {
      const [img] = await getDb().select().from(images).where(eq(images.id, imageId));
      if (!img) return err('unknown OS image', 400);
      // 'broken' images are quarantined by the bootability audit (a UEFI-only
      // build that can never boot). Offering them would be offering a VM that
      // cannot start.
      if (img.status !== 'ready') {
        return err(img.status === 'broken'
          ? `${img.name} is unavailable on this host — pick another OS`
          : `${img.name} is still ${img.status}, try another OS for now`, 400);
      }
    }
  }

  // pending duplicate name check
  const rd = rawDb();
  const dupe = rd.prepare(`select 1 from instance_requests where user_id=? and name=? and status='pending'`).get(user.id, name);
  if (dupe) return err('a pending request with that name already exists', 409);

  // Quota is checked HERE as well as at approval. Telling someone their request
  // is fine and only failing when an admin approves it wastes their time and the
  // admin's; approving a request that cannot be honoured is worse. The check is
  // re-run at approval because quota and other approvals move in between.
  const verdict = checkQuota(user.id, { vcpu: plan.vcpu, ramMb: plan.ramMb, diskGb: plan.diskGb });
  if (!verdict.allowed) return err(verdict.reason, 403);

  const id = newId('req_');
  rawDb().prepare(`insert into instance_requests (id,user_id,name,plan_id,image_id,note,status,created_at) values (?,?,?,?,?,?,?,?)`).run(
    id, user.id, name, plan.id, imageId || null,
    (body.note ?? '').trim().slice(0, 280) || null, 'pending', now());
  await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.request', target: id, detail: { name, planId: plan.id, imageId: imageId || null } });
  return json({ id, status: 'pending' }, 201);
}

export const dynamic = 'force-dynamic';
