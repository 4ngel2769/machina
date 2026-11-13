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

/** How many times we will re-run a provisioning job before giving up and
 *  showing the user an error. Bounded on purpose: an unbounded "self-heal"
 *  is just a loop that burns the host. */
export const HEAL_MAX = 3;
export const HEAL_MIN_AGE_MS = 90_000; // let a normal 60-90s boot finish first
export const HEAL_RUNNING_MS = 12 * 60_000; // a create running longer than this is wedged

type Rd = ReturnType<typeof rawDb>;

type StuckRow = { job_id?: string; instance_id: string; heal_count: number };

/**
 * Four independent ways an instance can be stuck. Unioned, deduped by caller.
 * Each query is its own statement because SQLite plans them separately and a
 * UNION would force one shape on rows that carry different columns.
 */
function collectStuckRows(rd: Rd, t: number): StuckRow[] {
  // 1. jobs that can never be claimed again (attempts spent / failed)
  const dead = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'failed'
      and i.status = 'provisioning'
  `).all() as StuckRow[];

  // 2. jobs wedged mid-run well past any boot time
  const wedged = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'running'
      and j.started_at < ?
      and i.status = 'provisioning'
  `).all(t - HEAL_RUNNING_MS) as StuckRow[];

  // 3. jobs that spent their attempt budget while still queued — nothing will
  //    ever claim them, so their instance would hang in provisioning forever
  const exhausted = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.status = 'queued' and j.attempts >= j.max_attempts
      and i.status = 'provisioning'
  `).all() as StuckRow[];

  // 4. provisioning rows whose job vanished entirely
  const orphans = rd.prepare(`
    select i.id as instance_id, i.heal_count from instances i
    where i.status = 'provisioning' and i.created_at < ?
      and not exists (select 1 from jobs j where j.instance_id = i.id and j.status in ('queued','running','failed'))
  `).all(t - HEAL_MIN_AGE_MS) as StuckRow[];

  return [...dead, ...wedged, ...exhausted, ...orphans];
}

/** Mark the instance errored and fail whatever job is still attached to it. */
function giveUp(rd: Rd, t: number, instanceId: string, reason: string): void {
  rd.prepare(`update instances set status='error', updated_at=? where id=? and status='provisioning'`)
    .run(t, instanceId);
  rd.prepare(`update jobs set status='failed', error=? where instance_id=? and status in ('queued','running')`)
    .run(reason, instanceId);
}

/** Drop the stale libvirt domain, disk and seed ISO. Deliberately detached:
 *  the heal must not block the worker loop, and a failure just means there was
 *  nothing to clear. */
function clearArtifacts(instanceId: string, domainName: string): void {
  import('@/lib/core/driver').then(({ destroyDomain, undefineDomain }) => {
    void destroyDomain(domainName).catch(() => {});
    void undefineDomain(domainName).catch(() => {});
  }).catch(() => {});
  // foreign-owned leftovers (libvirt/qemu chown) block the retry
  void import('fs/promises').then(async (fsp) => {
    const { diskVolFromId } = await import('@/lib/core/disks');
    const { storagePaths } = await import('@/lib/config');
    const sp = storagePaths();
    await fsp.rm(`${sp.vms}/${diskVolFromId(instanceId)}.qcow2`, { force: true }).catch(() => {});
    await fsp.rm(`${sp.seeds}/${instanceId}/seed.iso`, { force: true }).catch(() => {});
  }).catch(() => {});
}

/** Put the create job back in the queue, or mint one when the row lost it. */
function requeueJob(rd: Rd, t: number, r: StuckRow): void {
  if (r.job_id !== undefined) {
    rd.prepare(`update jobs set status='queued', attempts=0, run_after=0, error='' where id=?`).run(r.job_id);
    return;
  }
  rd.prepare(`insert into jobs (id,type,instance_id,user_id,payload,status,attempts,max_attempts,run_after,created_at)
              select 'job_' || substr(hex(randomblob(8)),1,16), 'instance.create', id, user_id, '{}', 'queued', 0, 3, 0, ?
              from instances where id=?`).run(t, r.instance_id);
}

/** Requeue one instance, or explain why it cannot be healed. */
function healOne(rd: Rd, t: number, r: StuckRow): 'healed' | 'gaveup' {
  // Never heal an instance whose image can never boot (quarantined at boot by
  // auditImageBootability). Retrying it is exactly the pointless loop we are
  // trying to eliminate — say what is actually wrong and stop.
  const img = rd.prepare(
    `select i.image_id, im.status, im.failure from instances i left join images im on im.id = i.image_id where i.id=?`,
  ).get(r.instance_id) as { image_id: string; status: string | null; failure: string | null } | undefined;
  if (img && img.status && img.status !== 'ready') {
    giveUp(rd, t, r.instance_id, `the OS image "${img.image_id}" is unusable: ${img.failure ?? img.status}`);
    console.log(`[worker] ${r.instance_id} cannot be healed: image ${img.image_id} is ${img.status}`);
    return 'gaveup';
  }

  if (r.heal_count >= HEAL_MAX) {
    giveUp(rd, t, r.instance_id, 'gave up after ' + HEAL_MAX + ' automatic attempts — try again or contact the operator');
    console.log(`[worker] self-heal gave up on ${r.instance_id} after ${HEAL_MAX} attempts`);
    return 'gaveup';
  }

  const row = rd.prepare(`select domain_name, heal_count from instances where id=?`).get(r.instance_id) as
    | { domain_name: string; heal_count: number } | undefined;
  if (row) clearArtifacts(r.instance_id, row.domain_name);
  rd.prepare(`update instances set heal_count=heal_count+1, updated_at=? where id=?`).run(t, r.instance_id);
  requeueJob(rd, t, r);
  console.log(`[worker] self-heal #${r.heal_count + 1} requeued ${r.instance_id}`);
  return 'healed';
}

export function healStuckProvisioning(): number {
  const rd = rawDb();
  const t = now();
  const seen = new Set<string>();
  let healed = 0;
  let gaveUp = 0;

  for (const r of collectStuckRows(rd, t)) {
    if (seen.has(r.instance_id)) continue;
    seen.add(r.instance_id);
    if (healOne(rd, t, r) === 'healed') healed++;
    else gaveUp++;
  }

  if (healed || gaveUp) {
    console.log(`[worker] self-heal pass: ${healed} requeued, ${gaveUp} given up`);
  }
  return healed + gaveUp;
}
