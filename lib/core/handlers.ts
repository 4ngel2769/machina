import fs from 'fs';
import net from 'net';
import { rawDb, getDb } from '@/lib/db';
import { instances, plans, images, users } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { decrypt, randToken } from './crypto';
import { buildSeed } from './cloudinit';
import {
  domainXml, defineDomain, startDomain, shutdownDomain, destroyDomain,
  undefineDomain, ensureIpLease, removeIpLease, domState,
  createSnapshot, revertSnapshot, deleteSnapshot, listSnapshots,
  isDomainRunning, diskUsage, assertSnapshotName, resumeDomain,
} from './driver';
import { createBackedDisk, deleteVolume, diskVolFromId } from './disks';
import { syncImage } from './images';
import { settleUser } from './metering';
import { ensureThrottleState } from './netmeter';
import { now, newInstanceId } from './util';
import { eq } from 'drizzle-orm';

/**
 * Job handlers. Contract: handler throws -> job retries (with backoff) up to
 * maxAttempts, then 'failed'. Create failures ALWAYS clean their own partial
 * state (disk, seed) and set instance status='error'.
 */

export interface JobCtx {
  id: string;
  instanceId: string | null;
  payload: string;
}
type Handler = (job: JobCtx, log: (m: string) => void) => Promise<void>;

export const HANDLERS: Record<string, Handler> = {
  'instance.create': create,
  'instance.start': start,
  'instance.stop': stop,
  'instance.delete': del,
  'instance.snapshot': snapshot,
  'instance.snapshot-revert': snapshotRevert,
  'instance.snapshot-delete': snapshotDelete,
  'image.sync': imageSync,
};

// ---------------------------------------------------------------- snapshots

/**
 * Quota gate for snapshot creation. A snapshot is a request to write to the
 * host's disk, so it is bounded three ways: count per instance, growth of the
 * overlay relative to the plan's disk, and free space left on the pool.
 * Refusing loudly beats filling the volume and taking every tenant's VM down
 * with it. Runs in the worker, not the request handler, because the check has
 * to be true at the moment the snapshot is actually taken.
 */
async function assertSnapshotQuota(instanceId: string): Promise<void> {
  const rd = rawDb();
  const count = (rd.prepare(`select count(*) c from snapshots where instance_id=?`).get(instanceId) as { c: number }).c;
  if (count >= config.limits.maxSnapshotsPerInstance) {
    throw new Error(
      `snapshot limit reached (${config.limits.maxSnapshotsPerInstance}) — delete one first`,
    );
  }
  const inst = rd.prepare(`select id, plan_id from instances where id=?`).get(instanceId) as
    { id: string; plan_id: string } | undefined;
  if (!inst) throw new Error('instance row missing');
  const plan = rd.prepare(`select disk_gb from plans where id=?`).get(inst.plan_id) as
    { disk_gb: number } | undefined;
  const planGb = plan?.disk_gb ?? 0;
  const usage = await diskUsage(diskVolFromId(instanceId));
  if (usage) {
    const capBytes = planGb * config.limits.snapshotGrowthRatio * 1024 ** 3;
    if (capBytes > 0 && usage.actualBytes > capBytes) {
      throw new Error(
        `disk has grown to ${(usage.actualBytes / 1024 ** 3).toFixed(1)} GB, past the ${planGb} GB plan limit — snapshots are refused until you delete some`,
      );
    }
    if (usage.freeMb < config.limits.snapshotFreeSpaceFloorMb) {
      throw new Error(
        `not enough free space on the host (${usage.freeMb} MB left) — snapshots are refused`,
      );
    }
  }
}

async function snapshot(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select id, domain_name from instances where id=?`).get(job.instanceId) as
    { id: string; domain_name: string } | undefined;
  if (!row) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string; description?: string };
  const name = assertSnapshotName(payload.name ?? '');
  await assertSnapshotQuota(row.id);
  const live = await isDomainRunning(row.domain_name);
  log(live ? 'freezing disk (instance is live)' : 'snapshotting disk');
  await createSnapshot(row.domain_name, name, payload.description ?? '');
  log('recording snapshot');
  // libvirt is the source of truth for size; record it so the tenant sees cost.
  const listed = await listSnapshots(row.domain_name).catch(() => []);
  const made = listed.find((s) => s.name === name);
  rd.prepare(
    `insert into snapshots (id, instance_id, name, description, state, size_bytes, current, created_at)
     values (?,?,?,?,?,?,?,?)
     on conflict(instance_id, name) do update set description=excluded.description,
       size_bytes=excluded.size_bytes, created_at=excluded.created_at`,
  ).run(
    `snap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    row.id, name, (payload.description ?? '').slice(0, 200),
    made?.state ?? (live ? 'running' : 'disk'), made?.sizeBytes ?? 0,
    1, now(),
  );
  log(`snapshot "${name}" taken`);
}

async function snapshotRevert(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select id, domain_name, user_id, status from instances where id=?`)
    .get(job.instanceId) as { id: string; domain_name: string; user_id: string; status: string } | undefined;
  if (!row) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string; mode?: 'live' | 'clean' };
  const name = assertSnapshotName(payload.name ?? '');
  const mode = payload.mode === 'live' ? 'live' : 'clean';

  // Reverting can throw away hours of metered work; bill what is owed first.
  log('settle before revert');
  await settleUser(row.user_id).catch(() => {});

  const wasRunning = await isDomainRunning(row.domain_name);
  if (mode === 'clean' && wasRunning) {
    log('clean revert: shutting down first');
    await shutdownDomain(row.domain_name);
    const grace = config.limits.shutdownGraceSec * 1000;
    const until = Date.now() + grace;
    for (;;) {
      const st = await domState(row.domain_name);
      if (st && /shut/i.test(st)) break;
      if (Date.now() >= until) {
        log('guest ignored ACPI shutdown; forcing');
        await destroyDomain(row.domain_name);
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  log(`reverting disk to "${name}"`);
  await revertSnapshot(row.domain_name, name);

  // Reverting leaves the domain PAUSED, not running and not shut off — even
  // for a snapshot taken from a running guest, and even if the guest was off.
  // `virsh start` on a paused domain fails with "Domain is already active",
  // so restore the pre-revert state deliberately rather than assuming it.
  const after = await domState(row.domain_name);
  if (wasRunning) {
    if (after && /paused/i.test(after)) {
      log('resuming instance');
      await resumeDomain(row.domain_name);
    } else if (!after || !/running/i.test(after)) {
      log('restarting instance');
      await startDomain(row.domain_name);
    }
  } else if (after && /paused/i.test(after)) {
    // It was off before the revert and must be off after it too.
    log('returning instance to stopped');
    await destroyDomain(row.domain_name);
  }
  // The current-state flags no longer describe the disk: we are now sitting on
  // a reverted disk, so no snapshot is "current" any more.
  rd.prepare(`update snapshots set current=0 where instance_id=?`).run(row.id);
  log(`reverted to "${name}"`);
}

async function snapshotDelete(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select id, domain_name from instances where id=?`).get(job.instanceId) as
    { id: string; domain_name: string } | undefined;
  if (!row) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string };
  const name = assertSnapshotName(payload.name ?? '');
  log(`deleting snapshot "${name}"`);
  await deleteSnapshot(row.domain_name, name);
  rd.prepare(`delete from snapshots where instance_id=? and name=?`).run(row.id, name);
  log(`snapshot "${name}" deleted`);
}

// ---------------------------------------------------------------- create

async function create(job: JobCtx, log: (m: string) => void): Promise<void> {
  if (!job.instanceId) throw new Error('create job missing instanceId');
  const rd = rawDb();
  const inst = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as
    | { id: string; user_id: string; plan_id: string; image_id: string; name: string; mac: string; ip: string; root_pass_enc: string; vnc_pass: string; domain_name: string; status: string }
    | undefined;
  if (!inst) throw new Error(`instance row ${job.instanceId} missing`);

  const [plan] = await getDb().select().from(plans).where(eq(plans.id, inst.plan_id));
  const [image] = await getDb().select().from(images).where(eq(images.id, inst.image_id));
  const [user] = await getDb().select().from(users).where(eq(users.id, inst.user_id));
  if (!plan || !image || !user) throw new Error('plan/image/user row missing');
  if (image.status !== ('ready' as const) || !image.path || !fs.existsSync(image.path)) {
    throw new Error(`image ${image.id} not ready for provisioning`);
  }
  if (user.balanceCents <= 0) throw new Error('balance exhausted; cannot provision');

  const rootPassword = decrypt(inst.root_pass_enc);
  log(`creating disk ${plan.diskGb}G from ${image.id}`);
  const disk = await createBackedDisk(inst.id, image.path, plan.diskGb);

  const seedIsoPath = `${config.storageDir}/seeds/${inst.id}/seed.iso`;
  log('building cloud-init seed');
  const sshPublicKeys = (
    rd.prepare(`select pub_key from ssh_keys where user_id=?`).all(inst.user_id) as { pub_key: string }[]
  ).map((r) => r.pub_key);
  await buildSeed({
    instanceId: inst.id,
    hostname: inst.name,
    rootPassword,
    sshPublicKeys,
    mac: inst.mac,
    ip: inst.ip,
    gateway: config.gateway,
    netmask: '255.255.255.0',
    dns: ['1.1.1.1', '9.9.9.9'],
    seedIsoPath,
  });

  const vncSocket = `${config.storageDir}/vnc/${inst.id}.vnc`;
  const vncPass = inst.vnc_pass || randToken(4).slice(0, 8);
  const serialPath = `${config.storageDir}/serial/${inst.id}.log`;
  const goXml = domainXml({
    domainName: inst.domain_name,
    instanceId: inst.id,
    vcpu: plan.vcpu,
    ramMb: plan.ramMb,
    diskVolPath: disk.volPath,
    seedIsoPath,
    mac: inst.mac,
    vncSocket,
    vncPass,
    serialPath,
  });
  log('defining domain');
  // a previous attempt may have left the domain defined (or even running);
  // define is not idempotent, so clear it first
  await destroyDomain(inst.domain_name).catch(() => {});
  await undefineDomain(inst.domain_name).catch(() => {});
  await defineDomain(goXml);
  log('dhcp lease entry');
  await ensureIpLease(inst.mac, inst.ip);
  log('starting domain');
  await startDomain(inst.domain_name);

  log('waiting for ssh');
  const okSsh = await waitSsh(inst.ip, 150_000);
  if (!okSsh) {
    await destroyDomain(inst.domain_name);
    await undefineDomain(inst.domain_name);
    await deleteVolume(disk.volName);
    rd.prepare(`update instances set status='error', updated_at=? where id=?`).run(now(), inst.id);
    throw new Error('provisioning timeout: ssh never came up (disk+domain cleaned)');
  }
  rd.prepare(`update instances set status='running', vnc_socket=?, vnc_pass=?, updated_at=? where id=?`)
    .run(vncSocket, vncPass, now(), inst.id);
  log('running');
}

/** TCP port-22 wait in guest IP space. */
export function waitSsh(ip: string, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const s = net.connect({ host: ip, port: 22, timeout: 2500 });
      const clean = (up: boolean) => {
        s.destroy();
        if (up) return resolve(true);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(attempt, 3000);
      };
      s.on('connect', () => clean(true));
      s.on('error', () => clean(false));
      s.on('timeout', () => clean(false));
    };
    attempt();
  });
}

// ---------------------------------------------------------------- start/stop

async function start(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string } | undefined;
  if (!row) throw new Error('instance row missing');
  log('starting');
  await startDomain(row.domain_name);
  await ensureThrottleState(row.id, row.domain_name).catch(() => {});
  log('running');
  rd.prepare(`update instances set status='running', auto_suspended=0, updated_at=? where id=?`)
    .run(now(), row.id);
}

async function stop(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string } | undefined;
  if (!row) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { force?: boolean; graceSec?: number };
  log('settle before stop');
  await settleUser(row.user_id).catch(() => {});
  if (payload.force) {
    log('force destroy');
    await destroyDomain(row.domain_name);
  } else {
    log('acpi shutdown');
    await shutdownDomain(row.domain_name);
    const grace = (payload.graceSec ?? config.limits.shutdownGraceSec) * 1000;
    const until = Date.now() + grace;
    for (let i = 0; i <= grace / 2000; i++) {
      const st = await domState(row.domain_name);
      if (st && /shut/i.test(st)) break;
      if (Date.now() >= until) {
        log('grace expired; forcing');
        await destroyDomain(row.domain_name);
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  log('stopped');
  rd.prepare(`update instances set status='stopped', auto_suspended=0, updated_at=? where id=?`)
    .run(now(), row.id);
}

// ---------------------------------------------------------------- delete

async function del(job: JobCtx, log: (m: string) => void): Promise<void> {
  const rd = rawDb();
  const row = rd.prepare(`select * from instances where id=?`).get(job.instanceId) as { id: string; domain_name: string; user_id: string; mac: string } | undefined;
  if (!row) throw new Error('instance row missing');
  log('settle before delete');
  await settleUser(row.user_id).catch(() => {});
  log('destroy+undefine');
  await destroyDomain(row.domain_name);
  await undefineDomain(row.domain_name);
  await removeIpLease(row.mac).catch(() => {});
  log('delete disk');
  await deleteVolume(diskVolFromId(row.id));
  log('rm seed + vnc socket');
  const fsp = await import('fs/promises');
  await fsp.rm(`${config.storageDir}/seeds/${row.id}`, { recursive: true, force: true }).catch(() => {});
  await fsp.rm(`${config.storageDir}/vnc/${row.id}.vnc`, { force: true }).catch(() => {});
  log('delete rows');
  rd.prepare(`delete from snapshots where instance_id=?`).run(row.id);
  rd.prepare(`delete from instances where id=?`).run(row.id);
  log('deleted');
}

// ---------------------------------------------------------------- image

async function imageSync(job: JobCtx, log: (m: string) => void): Promise<void> {
  const payload = JSON.parse(job.payload || '{}') as { imageId: string };
  log(`syncing ${payload.imageId}`);
  await syncImage(payload.imageId);
  log('done');
}
