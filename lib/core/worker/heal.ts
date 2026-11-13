/**
 * Bounded self-heal for stranded provisioning: collect the stuck rows, decide
 * per instance whether to requeue or give up, and clear the artifacts that make
 * every retry fail.
 *
 * Three real-world failure modes left users staring at "provisioning" forever:
 *  - the create job died (stale domain / chowned disk / seed ISO) and can
 *    never be claimed again because its attempts are spent;
 *  - the job is wedged (running far past any plausible boot);
 *  - the row has no job at all.
 *
 * Each instance gets at most HEAL_MAX heals — after that it is marked 'error'
 * with a readable reason so the UI can show it. Deliberately bounded: an
 * unbounded self-heal is a loop that quietly eats the host.
 */
import { rawDb } from '@/lib/db';
import { now } from '../util';
import { ignore } from '@/lib/core/ignore';

/** How many times we will re-run a provisioning job before giving up and
 *  showing the user an error. Bounded on purpose: an unbounded "self-heal"
 *  is just a loop that burns the host. */
export const HEAL_MAX = 3;
export const HEAL_MIN_AGE_MS = 90_000; // let a normal 60-90s boot finish first
export const HEAL_RUNNING_MS = 12 * 60_000; // a create running longer than this is wedged

type RawDb = ReturnType<typeof rawDb>;

type StuckRow = { job_id?: string; instance_id: string; heal_count: number };

/**
 * Four independent ways an instance can be stuck. Unioned, deduped by caller.
 * Each query is its own statement because SQLite plans them separately and a
 * UNION would force one shape on rows that carry different columns.
 */
function collectStuckRows(raw: RawDb, nowTs: number): StuckRow[] {
  // 1. jobs that can never be claimed again (attempts spent / failed)
  const dead = raw.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'failed'
      and i.status = 'provisioning'
  `).all() as StuckRow[];

  // 2. jobs wedged mid-run well past any boot time
  const wedged = raw.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'running'
      and j.started_at < ?
      and i.status = 'provisioning'
  `).all(nowTs - HEAL_RUNNING_MS) as StuckRow[];

  // 3. jobs that spent their attempt budget while still queued — nothing will
  //    ever claim them, so their instance would hang in provisioning forever
  const exhausted = raw.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.status = 'queued' and j.attempts >= j.max_attempts
      and i.status = 'provisioning'
  `).all() as StuckRow[];

  // 4. provisioning rows whose job vanished entirely
  const orphans = raw.prepare(`
    select i.id as instance_id, i.heal_count from instances i
    where i.status = 'provisioning' and i.created_at < ?
      and not exists (select 1 from jobs j where j.instance_id = i.id and j.status in ('queued','running','failed'))
  `).all(nowTs - HEAL_MIN_AGE_MS) as StuckRow[];

  return [...dead, ...wedged, ...exhausted, ...orphans];
}

/** Mark the instance errored and fail whatever job is still attached to it. */
function giveUp(raw: RawDb, nowTs: number, instanceId: string, reason: string): void {
  raw.prepare(`update instances set status='error', updated_at=? where id=? and status='provisioning'`)
    .run(nowTs, instanceId);
  raw.prepare(`update jobs set status='failed', error=? where instance_id=? and status in ('queued','running')`)
    .run(reason, instanceId);
}

/** Drop the stale libvirt domain, disk and seed ISO. Deliberately detached:
 *  the heal must not block the worker loop, and a failure just means there was
 *  nothing to clear. */
function clearArtifacts(instanceId: string, domainName: string): void {
  import('@/lib/core/driver').then(({ destroyDomain, undefineDomain }) => {
    void destroyDomain(domainName).catch(ignore('domain may already be gone'));
    void undefineDomain(domainName).catch(ignore('domain may already be undefined'));
  }).catch(ignore('heal cleanup is best-effort'));
  // foreign-owned leftovers (libvirt/qemu chown) block the retry
  void import('fs/promises').then(async (fsp) => {
    const { diskVolFromId } = await import('@/lib/core/disks');
    const { storagePaths } = await import('@/lib/config');
    const sp = storagePaths();
    await fsp.rm(`${sp.vms}/${diskVolFromId(instanceId)}.qcow2`, { force: true }).catch(ignore('overlay may not exist'));
    await fsp.rm(`${sp.seeds}/${instanceId}/seed.iso`, { force: true }).catch(ignore('seed may not exist'));
  }).catch(ignore('heal cleanup is best-effort'));
}

/** Put the create job back in the queue, or mint one when the row lost it. */
function requeueJob(raw: RawDb, nowTs: number, stuckRow: StuckRow): void {
  if (stuckRow.job_id !== undefined) {
    raw.prepare(`update jobs set status='queued', attempts=0, run_after=0, error='' where id=?`).run(stuckRow.job_id);
    return;
  }
  raw.prepare(`insert into jobs (id,type,instance_id,user_id,payload,status,attempts,max_attempts,run_after,created_at)
              select 'job_' || substr(hex(randomblob(8)),1,16), 'instance.create', id, user_id, '{}', 'queued', 0, 3, 0, ?
              from instances where id=?`).run(nowTs, stuckRow.instance_id);
}

/** Requeue one instance, or explain why it cannot be healed. */
function healOne(raw: RawDb, nowTs: number, stuckRow: StuckRow): 'healed' | 'gaveup' {
  // Never heal an instance whose image can never boot (quarantined at boot by
  // auditImageBootability). Retrying it is exactly the pointless loop we are
  // trying to eliminate — say what is actually wrong and stop.
  const imageRow = raw.prepare(
    `select i.image_id, im.status, im.failure from instances i left join images im on im.id = i.image_id where i.id=?`,
  ).get(stuckRow.instance_id) as { image_id: string; status: string | null; failure: string | null } | undefined;
  if (imageRow && imageRow.status && imageRow.status !== 'ready') {
    giveUp(raw, nowTs, stuckRow.instance_id, `the OS image "${imageRow.image_id}" is unusable: ${imageRow.failure ?? imageRow.status}`);
    console.log(`[worker] ${stuckRow.instance_id} cannot be healed: image ${imageRow.image_id} is ${imageRow.status}`);
    return 'gaveup';
  }

  if (stuckRow.heal_count >= HEAL_MAX) {
    giveUp(raw, nowTs, stuckRow.instance_id, 'gave up after ' + HEAL_MAX + ' automatic attempts — try again or contact the operator');
    console.log(`[worker] self-heal gave up on ${stuckRow.instance_id} after ${HEAL_MAX} attempts`);
    return 'gaveup';
  }

  const instanceRow = raw.prepare(`select domain_name, heal_count from instances where id=?`).get(stuckRow.instance_id) as
    | { domain_name: string; heal_count: number } | undefined;
  if (instanceRow) clearArtifacts(stuckRow.instance_id, instanceRow.domain_name);
  raw.prepare(`update instances set heal_count=heal_count+1, updated_at=? where id=?`).run(nowTs, stuckRow.instance_id);
  requeueJob(raw, nowTs, stuckRow);
  console.log(`[worker] self-heal #${stuckRow.heal_count + 1} requeued ${stuckRow.instance_id}`);
  return 'healed';
}

export function healStuckProvisioning(): number {
  const raw = rawDb();
  const nowTs = now();
  const seen = new Set<string>();
  let healed = 0;
  let gaveUpCount = 0;

  for (const stuckRow of collectStuckRows(raw, nowTs)) {
    if (seen.has(stuckRow.instance_id)) continue;
    seen.add(stuckRow.instance_id);
    if (healOne(raw, nowTs, stuckRow) === 'healed') healed++;
    else gaveUpCount++;
  }

  if (healed || gaveUpCount) {
    console.log(`[worker] self-heal pass: ${healed} requeued, ${gaveUpCount} given up`);
  }
  return healed + gaveUpCount;
}
