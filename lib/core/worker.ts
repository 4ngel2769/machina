import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { claimNext, finishJob } from './jobs';
import { HANDLERS } from './handlers';
import { sampleMetrics, pruneMetrics } from './metrics';
import { now } from './util';
import { friendlyError } from './errors';
import type { Database } from 'better-sqlite3';

/** How many times we will re-run a provisioning job before giving up and
 *  showing the user an error. Bounded on purpose: an unbounded "self-heal"
 *  is just a loop that burns the host. */
const HEAL_MAX = 3;
const HEAL_MIN_AGE_MS = 90_000; // let a normal 60-90s boot finish first
const HEAL_RUNNING_MS = 12 * 60_000; // a create running longer than this is wedged

/**
 * Single-flight worker: claims one queued job at a time and runs its handler.
 * Failures retry with exponential-ish backoff (run_after), up to the job's
 * max_attempts; each attempt's log is preserved. A poll tick plus every
 * enqueue() wakeup drive the loop. Also reaps stranded provisioning rows —
 * create jobs that died mid-flight leave instance status='provisioning'
 * behind otherwise. It also quarantines images with no BIOS bootloader,
 * which can never boot here.
 */

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let healTimer: ReturnType<typeof setInterval> | null = null;
let metricsTimer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

export function startWorker(): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, config.workerPollMs);
  healTimer = setInterval(() => { try { healStuckProvisioning(); } catch (e) {
    console.log(`[worker] self-heal pass failed: ${(e as Error).message}`);
  } }, 30_000);
  // Metrics ride their OWN timer. They must never share the job worker's loop:
  // a sweep that blocked on a wedged guest would stall provisioning behind a
  // cosmetic feature. sampleMetrics() is detached, internally guarded against
  // overlap, and swallows its own failures.
  metricsTimer = setInterval(() => { void sampleMetrics(); }, config.metrics.sampleMs);
  void sampleMetrics();
  pruneTimer = setInterval(() => { pruneMetrics(); }, 3600_000);
  // Boot-time recovery: jobs stranded in 'running' by a mid-job server death
  // are re-queued (a dead worker never marks them done).
  const { rawDb: db } = require('@/lib/db') as { rawDb(): Database };
  const n = db().prepare(`update jobs set status='queued', run_after=? where status='running'`).run(now());
  if (n.changes > 0) console.log(`[worker] reclaimed ${n.changes} stranded running job(s)`);
  console.log(`[worker] poll ${config.workerPollMs}ms`);
  void auditImageBootability();
}

/**
 * A qcow2 with no BIOS bootloader (UEFI-only builds such as Alpine's
 * `*-uefi-cloudinit-*`) cannot be booted by our SeaBIOS guests: the domain
 * starts, prints nothing to serial, and dies on the SSH timeout. That failure
 * is indistinguishable from a slow boot unless you diff the MBR, so check it
 * once at boot and refuse to serve an image that cannot possibly boot.
 */
async function auditImageBootability(): Promise<void> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const os = await import('os');
    const path = await import('path');
    const fsp = await import('fs/promises');
    const { storagePaths } = await import('@/lib/config');
    const pexec = promisify(execFile);
    const rd = rawDb();
    const sp = storagePaths();
    const rows = rd.prepare(`select id, path, status from images where status='ready'`).all() as
      { id: string; path: string; status: string }[];
    for (const img of rows) {
      const file = img.path || `${sp.images}/${img.id}.qcow2`;
      let bootable = false;
      try {
        // qemu-img dd writes binary to a real file reliably; /dev/stdout gives
        // us nothing usable through execFile, so stage the MBR on disk.
        const tmp = path.join(os.tmpdir(), `machina-mbr-${process.pid}-${img.id}.bin`);
        await pexec('qemu-img', ['dd', `if=${file}`, `of=${tmp}`, 'bs=512', 'count=1'], { maxBuffer: 4096 });
        const buf = await fsp.readFile(tmp);
        await fsp.rm(tmp, { force: true }).catch(() => {});
        bootable = buf.length >= 512
          && buf[510] === 0x55 && buf[511] === 0xaa      // MBR signature
          && !(buf[0] === 0 && buf[1] === 0 && buf[2] === 0); // GPT disk, no BIOS boot code
      } catch {
        continue; // unreadable: leave it alone rather than disable a good image
      }
      if (!bootable) {
        rd.prepare(`update images set status='broken', failure=? where id=?`)
          .run('image has no BIOS bootloader (UEFI-only build) — not bootable on this host', img.id);
        console.log(`[worker] image ${img.id} marked broken: no BIOS bootloader`);
      }
    }
  } catch (e) {
    console.log(`[worker] image bootability audit skipped: ${(e as Error).message}`);
  }
}

export function stopWorker(): void {
  stopped = true;
  if (timer) { clearInterval(timer); timer = null; }
  if (healTimer) { clearInterval(healTimer); healTimer = null; }
  if (metricsTimer) { clearInterval(metricsTimer); metricsTimer = null; }
  if (pruneTimer) { clearInterval(pruneTimer); pruneTimer = null; }
}

export function wakingTick(): void {
  setImmediate(() => { void tick(); });
}

async function tick(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    await reapProvisioning();
    const job = await claimNext();
    if (!job) return;
    console.log(`[worker] job ${job.id}: ${job.type} ${job.instanceId ?? ''}`);
    const logs: string[] = [];
    const log = (m: string) => {
      logs.push(`[${new Date().toISOString()}] ${m}`);
      console.log(`[worker:${job.type}] ${m}`);
    };
    try {
      const h = HANDLERS[job.type];
      if (!h) throw new Error(`no handler for ${job.type}`);
      await h({ id: job.id, instanceId: job.instanceId, payload: job.payload }, log);
      await finishJob(job.id, true, logs.join('\n'));
    } catch (e) {
      const raw = String((e as Error).message || e);
      log(`FAILED: ${raw}`);
      // raw tool output stays in the log; users get one readable sentence
      await finishJob(job.id, false, logs.join('\n'), friendlyError(raw));
    }
  } finally {
    running = false;
  }
}

/**
 * Provisioning rows older than 30 minutes with no in-flight create job are
 * dead; mark them error so the user sees failure instead of a perpetual
 * spinner. Non-fatal on error.
 */
export async function reapProvisioning(): Promise<number> {
  const rd = rawDb();
  const cutoff = now() - 30 * 60 * 1000;
  const rows = rd.prepare(`
    select i.id, i.status from instances i
    where i.status = 'provisioning' and i.created_at < ?
      and not exists (select 1 from jobs j where j.instance_id = i.id and j.status in ('queued','running'))
  `).all(cutoff) as { id: string }[];
  for (const r of rows) {
    rd.prepare(`update instances set status='error', updated_at=? where id=?`).run(now(), r.id);
    console.log(`[worker] reaped stranded provisioning instance ${r.id}`);
  }
  return rows.length;
}

/**
 * Bounded self-heal for stuck provisioning.
 *
 * Three real-world failure modes left users staring at "provisioning" forever:
 *  - the create job died (stale domain / chowned disk / seed ISO) and can
 *    never be claimed again because its attempts are spent;
 *  - the job is wedged (running far past any plausible boot);
 *  - the row has no job at all.
 *
 * Each instance gets at most HEAL_MAX heals — after that it is marked 'error'
 * with a readable reason so the UI can show it. The heal itself clears the
 * artifacts that make retries fail (stale libvirt domain, foreign-owned disk
 * and seed ISO) and requeues the job with attempts reset. Deliberately
 * bounded: an unbounded self-heal is a loop that quietly eats the host.
 */
export function healStuckProvisioning(): number {
  const rd = rawDb();
  const t = now();

  // 1. jobs that can never be claimed again (attempts spent / failed)
  const dead = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'failed'
      and i.status = 'provisioning'
  `).all() as { job_id: string; instance_id: string; heal_count: number }[];

  // 2. jobs wedged mid-run well past any boot time
  const wedged = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.type = 'instance.create' and j.status = 'running'
      and j.started_at < ?
      and i.status = 'provisioning'
  `).all(t - HEAL_RUNNING_MS) as { job_id: string; instance_id: string; heal_count: number }[];

  // 3. jobs that spent their attempt budget while still queued — nothing will
  //    ever claim them, so their instance would hang in provisioning forever
  const exhausted = rd.prepare(`
    select j.id as job_id, j.instance_id, i.heal_count
    from jobs j join instances i on i.id = j.instance_id
    where j.status = 'queued' and j.attempts >= j.max_attempts
      and i.status = 'provisioning'
  `).all() as { job_id: string; instance_id: string; heal_count: number }[];

  // 4. provisioning rows whose job vanished entirely
  const orphans = rd.prepare(`
    select i.id as instance_id, i.heal_count from instances i
    where i.status = 'provisioning' and i.created_at < ?
      and not exists (select 1 from jobs j where j.instance_id = i.id and j.status in ('queued','running','failed'))
  `).all(t - HEAL_MIN_AGE_MS) as { job_id?: string; instance_id: string; heal_count: number }[];

  const seen = new Set<string>();
  let healed = 0;
  let gaveUp = 0;

  for (const r of [...dead, ...wedged, ...exhausted, ...orphans]) {
    if (seen.has(r.instance_id)) continue;
    seen.add(r.instance_id);

    // Never heal an instance whose image can never boot (quarantined at boot by
    // auditImageBootability). Retrying it is exactly the pointless loop we are
    // trying to eliminate — say what is actually wrong and stop.
    const img = rd.prepare(
      `select i.image_id, im.status, im.failure from instances i left join images im on im.id = i.image_id where i.id=?`,
    ).get(r.instance_id) as { image_id: string; status: string | null; failure: string | null } | undefined;
    if (img && img.status && img.status !== 'ready') {
      rd.prepare(`update instances set status='error', updated_at=? where id=? and status='provisioning'`).run(t, r.instance_id);
      rd.prepare(`update jobs set status='failed', error=? where instance_id=? and status in ('queued','running')`)
        .run(`the OS image "${img.image_id}" is unusable: ${img.failure ?? img.status}`, r.instance_id);
      gaveUp++;
      console.log(`[worker] ${r.instance_id} cannot be healed: image ${img.image_id} is ${img.status}`);
      continue;
    }

    if (r.heal_count >= HEAL_MAX) {
      rd.prepare(`update instances set status='error', updated_at=? where id=? and status='provisioning'`)
        .run(t, r.instance_id);
      rd.prepare(`update jobs set status='failed', error=? where instance_id=? and status in ('queued','running')`)
        .run('gave up after ' + HEAL_MAX + ' automatic attempts — try again or contact the operator', r.instance_id);
      gaveUp++;
      console.log(`[worker] self-heal gave up on ${r.instance_id} after ${HEAL_MAX} attempts`);
      continue;
    }

    // clear the artifacts that make every retry fail
    const row = rd.prepare(`select domain_name, heal_count from instances where id=?`).get(r.instance_id) as
      | { domain_name: string; heal_count: number } | undefined;
    if (row) {
      const name = row.domain_name;
      // async libvirt calls are fire-and-forget here: the heal must not block
      // the worker loop, and a failure just means there was nothing to clear.
      import('@/lib/core/driver').then(({ destroyDomain, undefineDomain }) => {
        void destroyDomain(name).catch(() => {});
        void undefineDomain(name).catch(() => {});
      }).catch(() => {});
      // foreign-owned leftovers (libvirt/qemu chown) block the retry
      void import('fs/promises').then(async (fsp) => {
        const { diskVolFromId } = await import('@/lib/core/disks');
        const { storagePaths } = await import('@/lib/config');
        const sp = storagePaths();
        await fsp.rm(`${sp.vms}/${diskVolFromId(r.instance_id)}.qcow2`, { force: true }).catch(() => {});
        await fsp.rm(`${sp.seeds}/${r.instance_id}/seed.iso`, { force: true }).catch(() => {});
      }).catch(() => {});
    }

    rd.prepare(`update instances set heal_count=heal_count+1, updated_at=? where id=?`).run(t, r.instance_id);
    if (r.job_id !== undefined) {
      rd.prepare(`update jobs set status='queued', attempts=0, run_after=0, error='' where id=?`).run(r.job_id);
    } else {
      rd.prepare(`insert into jobs (id,type,instance_id,user_id,payload,status,attempts,max_attempts,run_after,created_at)
                  select 'job_' || substr(hex(randomblob(8)),1,16), 'instance.create', id, user_id, '{}', 'queued', 0, 3, 0, ?
                  from instances where id=?`).run(t, r.instance_id);
    }
    healed++;
    console.log(`[worker] self-heal #${r.heal_count + 1} requeued ${r.instance_id}`);
  }

  if (healed || gaveUp) {
    console.log(`[worker] self-heal pass: ${healed} requeued, ${gaveUp} given up`);
  }
  return healed + gaveUp;
}
