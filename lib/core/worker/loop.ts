/**
 * The worker loop: timers, job claiming, per-job logging and the stranded
 * provisioning reaper.
 *
 * Single-flight: one queued job at a time. Failures retry with exponential-ish
 * backoff (run_after), up to the job's max_attempts; each attempt's log is
 * preserved. A poll tick plus every enqueue() wakeup drive the loop.
 */
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { claimNext, finishJob } from '../jobs';
import { HANDLERS } from '../handlers';
import { sampleMetrics, pruneMetrics } from '../metrics';
import { now } from '../util';
import { friendlyError } from '../errors';
import { healStuckProvisioning } from './heal';
import { auditImageBootability } from './image-audit';
import { logInfo } from '@/lib/core/log';

let tickInFlight = false;
let timer: ReturnType<typeof setInterval> | null = null;
let healTimer: ReturnType<typeof setInterval> | null = null;
let metricsTimer: ReturnType<typeof setInterval> | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;
let stopped = false;

export function startWorker(): void {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, config.workerPollMs);
  healTimer = setInterval(() => { try { healStuckProvisioning(); } catch (healError) {
    logInfo(`[worker] self-heal pass failed: ${(healError as Error).message}`);
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
  const reclaimed = rawDb().prepare(`update jobs set status='queued', run_after=? where status='running'`).run(now());
  if (reclaimed.changes > 0) logInfo(`[worker] reclaimed ${reclaimed.changes} stranded running job(s)`);
  logInfo(`[worker] poll ${config.workerPollMs}ms`);
  void auditImageBootability();
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
  if (tickInFlight || stopped) return;
  tickInFlight = true;
  try {
    await reapProvisioning();
    const job = await claimNext();
    if (!job) return;
    logInfo(`[worker] job ${job.id}: ${job.type} ${job.instanceId ?? ''}`);
    const logs: string[] = [];
    const log = (m: string) => {
      logs.push(`[${new Date().toISOString()}] ${m}`);
      logInfo(`[worker:${job.type}] ${m}`);
    };
    try {
      const handler = HANDLERS[job.type];
      if (!handler) throw new Error(`no handler for ${job.type}`);
      await handler({ id: job.id, instanceId: job.instanceId, payload: job.payload }, log);
      await finishJob(job.id, true, logs.join('\n'));
    } catch (jobError) {
      const rawError = String((jobError as Error).message || jobError);
      log(`FAILED: ${rawError}`);
      // raw tool output stays in the log; users get one readable sentence
      await finishJob(job.id, false, logs.join('\n'), friendlyError(rawError));
    }
  } finally {
    tickInFlight = false;
  }
}

/**
 * Provisioning rows older than 30 minutes with no in-flight create job are
 * dead; mark them error so the user sees failure instead of a perpetual
 * spinner. Non-fatal on error.
 */
export async function reapProvisioning(): Promise<number> {
  const raw = rawDb();
  const cutoff = now() - 30 * 60 * 1000;
  const rows = raw.prepare(`
    select i.id, i.status from instances i
    where i.status = 'provisioning' and i.created_at < ?
      and not exists (select 1 from jobs j where j.instance_id = i.id and j.status in ('queued','running'))
  `).all(cutoff) as { id: string }[];
  for (const instanceRow of rows) {
    raw.prepare(`update instances set status='error', updated_at=? where id=?`).run(now(), instanceRow.id);
    logInfo(`[worker] reaped stranded provisioning instance ${instanceRow.id}`);
  }
  return rows.length;
}
