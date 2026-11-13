/**
 * Snapshot handlers: create (quota-gated), revert and delete. The quota gate
 * runs here rather than in the route because it has to be true at the moment
 * the snapshot is actually written.
 */
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import {
  createSnapshot, revertSnapshot, deleteSnapshot, listSnapshots,
  isDomainRunning, diskUsage, assertSnapshotName, resumeDomain, startDomain,
  destroyDomain, domState,
} from '../driver';
import { diskVolFromId } from '../disks';
import { settleUser } from '../metering';
import { now } from '../util';
import { shutdownAndWait } from './lifecycle';
import type { JobCtx } from '../handlers';

/**
 * Quota gate for snapshot creation. A snapshot is a request to write to the
 * host's disk, so it is bounded three ways: count per instance, growth of the
 * overlay relative to the plan's disk, and free space left on the pool.
 * Refusing loudly beats filling the volume and taking every tenant's VM down
 * with it. Runs in the worker, not the request handler, because the check has
 * to be true at the moment the snapshot is actually taken.
 */
async function assertSnapshotQuota(instanceId: string): Promise<void> {
  const raw = rawDb();
  const snapshotCount = (raw.prepare(`select count(*) c from snapshots where instance_id=?`).get(instanceId) as { c: number }).c;
  if (snapshotCount >= config.limits.maxSnapshotsPerInstance) {
    throw new Error(
      `snapshot limit reached (${config.limits.maxSnapshotsPerInstance}) — delete one first`,
    );
  }
  const instanceRow = raw.prepare(`select id, plan_id from instances where id=?`).get(instanceId) as
    { id: string; plan_id: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  const plan = raw.prepare(`select disk_gb from plans where id=?`).get(instanceRow.plan_id) as
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

/** Record the snapshot libvirt just took. Size and state come from libvirt,
 *  which is the source of truth; the tenant sees the real cost. */
function recordSnapshot(
  instanceId: string,
  name: string,
  description: string,
  snapshotInfo: { state: string; sizeBytes: number } | undefined,
  isLive: boolean,
): void {
  rawDb().prepare(
    `insert into snapshots (id, instance_id, name, description, state, size_bytes, current, created_at)
     values (?,?,?,?,?,?,?,?)
     on conflict(instance_id, name) do update set description=excluded.description,
       size_bytes=excluded.size_bytes, created_at=excluded.created_at`,
  ).run(
    `snap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    instanceId, name, description.slice(0, 200),
    snapshotInfo?.state ?? (isLive ? 'running' : 'disk'), snapshotInfo?.sizeBytes ?? 0,
    1, now(),
  );
}

export async function snapshot(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select id, domain_name from instances where id=?`).get(job.instanceId) as
    { id: string; domain_name: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string; description?: string };
  const name = assertSnapshotName(payload.name ?? '');
  await assertSnapshotQuota(instanceRow.id);
  const isLive = await isDomainRunning(instanceRow.domain_name);
  log(isLive ? 'freezing disk (instance is live)' : 'snapshotting disk');
  await createSnapshot(instanceRow.domain_name, name, payload.description ?? '');
  log('recording snapshot');
  const listed = await listSnapshots(instanceRow.domain_name).catch(() => []);
  recordSnapshot(instanceRow.id, name, payload.description ?? '', listed.find((snapshot) => snapshot.name === name), isLive);
  log(`snapshot "${name}" taken`);
}

/** Put the domain back into the state it had before a revert. */
async function restoreRunState(
  domainName: string,
  wasRunning: boolean,
  log: (m: string) => void,
): Promise<void> {
  const stateAfter = await domState(domainName);
  if (wasRunning) {
    if (stateAfter && /paused/i.test(stateAfter)) {
      log('resuming instance');
      await resumeDomain(domainName);
      return;
    }
    if (!stateAfter || !/running/i.test(stateAfter)) {
      log('restarting instance');
      await startDomain(domainName);
    }
    return;
  }
  // It was off before the revert and must be off after it too.
  if (stateAfter && /paused/i.test(stateAfter)) {
    log('returning instance to stopped');
    await destroyDomain(domainName);
  }
}

export async function snapshotRevert(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select id, domain_name, user_id, status from instances where id=?`)
    .get(job.instanceId) as { id: string; domain_name: string; user_id: string; status: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string; mode?: 'live' | 'clean' };
  const name = assertSnapshotName(payload.name ?? '');
  const mode = payload.mode === 'live' ? 'live' : 'clean';

  // Reverting can throw away hours of metered work; bill what is owed first.
  log('settle before revert');
  await settleUser(instanceRow.user_id).catch(() => {});

  const wasRunning = await isDomainRunning(instanceRow.domain_name);
  if (mode === 'clean' && wasRunning) {
    log('clean revert: shutting down first');
    await shutdownAndWait(
      instanceRow.domain_name,
      { graceSec: config.limits.shutdownGraceSec, forceMessage: 'guest ignored ACPI shutdown; forcing' },
      log,
    );
  }
  log(`reverting disk to "${name}"`);
  await revertSnapshot(instanceRow.domain_name, name);

  // Reverting leaves the domain PAUSED, not running and not shut off — even
  // for a snapshot taken from a running guest, and even if the guest was off.
  // `virsh start` on a paused domain fails with "Domain is already active",
  // so restore the pre-revert state deliberately rather than assuming it.
  await restoreRunState(instanceRow.domain_name, wasRunning, log);
  // The current-state flags no longer describe the disk: we are now sitting on
  // a reverted disk, so no snapshot is "current" any more.
  raw.prepare(`update snapshots set current=0 where instance_id=?`).run(instanceRow.id);
  log(`reverted to "${name}"`);
}

export async function snapshotDelete(job: JobCtx, log: (m: string) => void): Promise<void> {
  const raw = rawDb();
  const instanceRow = raw.prepare(`select id, domain_name from instances where id=?`).get(job.instanceId) as
    { id: string; domain_name: string } | undefined;
  if (!instanceRow) throw new Error('instance row missing');
  const payload = JSON.parse(job.payload || '{}') as { name?: string };
  const name = assertSnapshotName(payload.name ?? '');
  log(`deleting snapshot "${name}"`);
  await deleteSnapshot(instanceRow.domain_name, name);
  raw.prepare(`delete from snapshots where instance_id=? and name=?`).run(instanceRow.id, name);
  log(`snapshot "${name}" deleted`);
}
