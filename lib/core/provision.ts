/**
 * Create an instance: overlay disk, cloud-init seed, domain XML, IP and MAC.
 */
import { getDb, rawDb } from '@/lib/db';
import { instances, plans, images, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { enqueue } from '@/lib/core/jobs';
import { newInstanceId, now } from '@/lib/core/util';
import { encrypt, randToken, randPassword } from '@/lib/core/crypto';
import { config } from '@/lib/config';
import { macFromId, IpAllocator } from '@/lib/core/driver';
import { checkQuota } from '@/lib/core/quota';
import { logAudit } from '@/lib/services/audit';

export type ProvisionArgs = {
  userId: string;
  name: string;
  planId: string;
  imageId?: string;
  actorName?: string;
  actorRole?: string;
  /** Pending request being fulfilled; excluded from the quota sum so approving a
   *  request does not count that request against itself. */
  excludeRequestId?: string;
  /** Absolute path of an existing guest disk to clone from. The create job
   *  copies it instead of laying an overlay on the base image, so every other
   *  step (IP, MAC, seed, quota, billing, job) stays the one shared path. */
  copyFromPath?: string;
};

/** Image to provision from: the request's choice unless the account is locked. */
async function resolveImageId(
  dbUser: { imagePickable: number; assignedImageId: string | null },
  requested: string | undefined,
): Promise<string> {
  let imageId = requested ?? '';
  if (!dbUser.imagePickable && dbUser.assignedImageId) imageId = dbUser.assignedImageId;
  // A request that did not name an image used to fail approval with the
  // bewildering "image not ready", because the lookup ran against the empty
  // string. Fall back in a defined order instead: the user's assigned image,
  // then the first image that is actually ready. An admin approving a request
  // can still override with an explicit imageId.
  if (!imageId && dbUser.assignedImageId) imageId = dbUser.assignedImageId;
  if (!imageId) {
    const [fallback] = await getDb().select().from(images)
      .where(eq(images.status, 'ready'))
      .orderBy(images.name);
    imageId = fallback?.id ?? '';
  }
  return imageId;
}

function assertNameFree(rd: ReturnType<typeof rawDb>, userId: string, name: string): void {
  const dupe = rd.prepare(`select 1 from instances where user_id=? and name=?`).get(userId, name);
  if (dupe) throw new Error('name already used');
}

function allocateIp(rd: ReturnType<typeof rawDb>): string {
  const taken = (rd.prepare(`select ip from instances where ip is not null`).all() as { ip: string }[]).map((r) => r.ip);
  const ip = new IpAllocator(taken).next();
  if (!ip) throw new Error('no free IP in range');
  return ip;
}

/**
 * MAC must be unique among live instances — a collision on the bridge makes
 * every VM but one hang on networkd-wait-online, so refuse rather than
 * provision a VM that can never get an address.
 */
function assertMacFree(rd: ReturnType<typeof rawDb>, mac: string, id: string): void {
  const macClash = rd.prepare(`select id from instances where mac=? and id<>?`).get(mac, id);
  if (macClash) throw new Error('MAC address collision — please retry');
}

function instanceValues(
  a: ProvisionArgs,
  plan: { id: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; monthlyCapMin: number; bandwidthGb: number | null },
  imageId: string,
  id: string,
  mac: string,
  ip: string,
  rootPassword: string,
  vncPass: string,
) {
  return {
    id,
    domainName: `${config.domainPrefix}${id.slice(3, 16)}`,
    userId: a.userId,
    planId: plan.id,
    imageId,
    name: a.name,
    status: 'provisioning',
    mac,
    ip,
    vncSocket: `${config.storageDir}/vnc/${id}.vnc`,
    vncPass,
    rootPassEnc: encrypt(rootPassword),
    rateHourlyCents: plan.hourlyRateCents,
    monthlyCapMin: plan.monthlyCapMin,
    bandwidthGb: plan.bandwidthGb ?? 0,
    createdAt: now(),
    updatedAt: now(),
  };
}

/** Shared provisioning entry point used by direct (admin) create and by
 *  request approval. Validates plan/image, budget, caps, uniqueness, IP
 *  allocation, inserts the instance row and enqueues the create job. */
export async function provisionInstance(a: ProvisionArgs): Promise<{ id: string; name: string; ip: string }> {
  const db = getDb();
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, a.planId), eq(plans.active, 1)));
  if (!plan) throw new Error('plan invalid');

  const [dbUser] = await db.select().from(users).where(eq(users.id, a.userId));
  if (!dbUser) throw new Error('no user');

  const imageId = await resolveImageId(dbUser, a.imageId);
  const [image] = await db.select().from(images).where(eq(images.id, imageId));
  if (!image) throw new Error('no OS image is available on the host yet — an admin needs to add one first');
  if (image.status !== 'ready') throw new Error(`OS image "${image.id}" is ${image.status}, not ready`);

  if (dbUser.balanceCents < plan.hourlyRateCents) throw new Error('insufficient balance for 1h at plan rate');

  // Quota AND host capacity, in one place. Every create path (admin create,
  // request approval) funnels through here, so this is the only place that has
  // to be right — an enforcement check that lives in one caller and not the
  // other is not enforcement, it is a suggestion.
  const verdict = checkQuota(a.userId, { vcpu: plan.vcpu, ramMb: plan.ramMb, diskGb: plan.diskGb }, {
    isAdmin: a.actorRole === 'admin',
    excludeRequestId: a.excludeRequestId,
  });
  if (!verdict.allowed) throw new Error(verdict.reason);

  const rd = rawDb();
  assertNameFree(rd, a.userId, a.name);
  const ip = allocateIp(rd);
  const id = newInstanceId();
  const mac = macFromId(id);
  assertMacFree(rd, mac, id);

  const rootPassword = randPassword();
  const vncPass = randToken(4).slice(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
  await db.insert(instances).values(instanceValues(a, plan, image.id, id, mac, ip, rootPassword, vncPass));
  await logAudit({ actorId: a.userId, actorName: a.actorName ?? a.userId, action: 'instance.create',
    target: id, detail: { name: a.name, planId: plan.id, imageId: image.id, clone: Boolean(a.copyFromPath) } });

  await enqueue({ type: 'instance.create', instanceId: id, userId: a.userId,
    payload: {
      planSnapshot: { vcpu: plan.vcpu, ramMb: plan.ramMb, diskGb: plan.diskGb },
      ...(a.copyFromPath ? { copyFromPath: a.copyFromPath } : {}),
    } });
  return { id, name: a.name, ip };
}