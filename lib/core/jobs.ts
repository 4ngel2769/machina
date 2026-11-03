import { getDb, rawDb } from '@/lib/db';
import { jobs } from '@/lib/db/schema';
import { newJobId, now } from './util';
import { // eslint-disable-line import/order
  eq,
  inArray,
  asc,
  and,
  or,
} from 'drizzle-orm';

export type JobType =
  | 'instance.create'
  | 'instance.start'
  | 'instance.stop'
  | 'instance.delete'
  | 'instance.snapshot'
  | 'instance.snapshot-revert'
  | 'instance.snapshot-delete'
  | 'image.sync';

/** Enqueue a job. Workers poll status in ('queued','running'). */
let waker: (() => void) | null = null;
export function setWaker(fn: () => void): void {
  waker = fn;
}

export async function enqueue(input: {
  type: JobType;
  instanceId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const id = newJobId();
  await getDb().insert(jobs).values({
    id,
    type: input.type,
    instanceId: input.instanceId ?? null,
    userId: input.userId ?? null,
    payload: JSON.stringify(input.payload ?? {}),
    status: 'queued',
    createdAt: now(),
  });
  waker?.();
  return id;
}

/** Atomically claim one runnable job. */
/**
 * Claim the next runnable job. Image syncs are multi-minute downloads and
 * used to starve provisioning behind them on this single-flight worker, so
 * they sort last: instance work always drains first.
 */
export async function claimNext(): Promise<{
  id: string; type: JobType; instanceId: string | null; userId: string | null; payload: string;
} | null> {
  const db = rawDb();
  for (let i = 0; i < 8; i++) {
    const rows = db
      .prepare<unknown[], { id: string; type: string; instance_id: string | null; user_id: string | null; payload: string }>(
        // Never claim a job that has already spent its attempt budget: it can
        // only fail again, and on a single-flight worker that starves every
        // other job (an image sync queued behind a doomed create never ran).
        `select id, type, instance_id, user_id, payload from jobs
         where status='queued' and run_after <= ? and attempts < max_attempts
         order by case when type='image.sync' then 1 else 0 end, created_at asc
         limit 1`,
      )
      .all(now());
    const j = rows[0];
    if (!j) return null;
    const r = db
      .prepare(`update jobs set status='running', started_at=?, attempts=attempts+1 where id=? and status='queued'`)
      .run(now(), j.id);
    if (r.changes === 1) {
      return {
        id: j.id,
        type: j.type as JobType,
        instanceId: j.instance_id,
        userId: j.user_id,
        payload: j.payload,
      };
    }
  }
  return null;
}

export async function finishJob(id: string, ok: boolean, log?: string, error?: string, retryInSec = 30): Promise<void> {
  const db = rawDb();
  const row = db.prepare('select attempts, max_attempts from jobs where id=?').get(id) as
    | { attempts: number; max_attempts: number }
    | undefined;
  if (!ok && row && row.attempts < row.max_attempts) {
    db.prepare(`update jobs set status='queued', run_after=?, log=?, error=? where id=?`)
      .run(now() + retryInSec * 1000, (log ?? '').slice(0, 8000), (error ?? '').slice(0, 2000), id);
    return;
  }
  db.prepare(
    `update jobs set status=?, log=?, error=?, finished_at=? where id=?`,
  ).run(ok ? 'done' : 'failed', (log ?? '').slice(0, 8000), (error ?? '').slice(0, 2000), now(), id);
}

/** Jobs still in flight for an instance (used by the reconciler to skip busy rows). */
export async function inFlightForInstance(instanceId: string): Promise<boolean> {
  const rows = await getDb().select({ id: jobs.id }).from(jobs).where(
    and(eq(jobs.instanceId, instanceId), inArray(jobs.status, ['queued', 'running'])),
  );
  return rows.length > 0;
}

export async function anyInFlight(): Promise<number> {
  const rows = await getDb().select({ id: jobs.id }).from(jobs).where(
    or(eq(jobs.status, 'queued'), eq(jobs.status, 'running')),
  ).orderBy(asc(jobs.createdAt));
  return rows.length;
}
