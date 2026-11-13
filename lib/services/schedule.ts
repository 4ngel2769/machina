/**
 * Scheduled operations: start/stop an instance once, daily, or weekly.
 *
 * The worker's scheduler pass (lib/core/scheduler.ts) reads due rows and
 * enqueues the real lifecycle job, so a schedule survives restarts and never
 * runs outside the normal job pipeline — same checks, same audit, same
 * notifications.
 */

import { rawDb } from '@/lib/db';
import { newId } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';
import { enqueue } from '@/lib/core/jobs';
import { logInfo } from '@/lib/core/log';
import { notify } from '@/lib/services/notify';

export type ScheduleFreq = 'once' | 'daily' | 'weekly';

export type ScheduledOp = {
  id: string; user_id: string; instance_id: string; action: string;
  run_at: number | null; daily_time: string | null; weekly_dow: number | null;
  next_run: number; last_run: number | null; status: string;
  last_error: string | null; created_at: number;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function onceSpec(action: 'start' | 'stop', body: { runAt?: number }) {
  const runAt = typeof body.runAt === 'number' ? body.runAt : 0;
  if (!runAt || runAt <= now()) return { ok: false as const, error: 'runAt must be a future timestamp' };
  return { ok: true as const, spec: { action, freq: 'once' as const, runAt, dailyTime: null, weeklyDow: null, nextRun: runAt } };
}

function recurringSpec(action: 'start' | 'stop', freq: 'daily' | 'weekly', body: { time?: string; dow?: number }) {
  const time = (body.time ?? '').trim();
  if (!TIME_RE.test(time)) return { ok: false as const, error: 'time must be HH:MM (24h)' };
  let dow: number | null = null;
  if (freq === 'weekly') {
    const d = typeof body.dow === 'number' ? body.dow : -1;
    if (d < 0 || d > 6) return { ok: false as const, error: 'dow must be 0 (Sun) to 6 (Sat)' };
    dow = d;
  }
  return { ok: true as const, spec: { action, freq, runAt: null, dailyTime: time, weeklyDow: dow, nextRun: nextAfter(time, dow) } };
}

/** Validate + compute the first next_run for a schedule request. */
export function scheduleSpec(body: {
  action?: string; freq?: string; runAt?: number; time?: string; dow?: number;
}): { ok: true; spec: {
  action: 'start' | 'stop'; freq: ScheduleFreq;
  runAt: number | null; dailyTime: string | null; weeklyDow: number | null;
  nextRun: number;
} } | { ok: false; error: string } {
  const action = body.action;
  if (action !== 'start' && action !== 'stop') return { ok: false, error: 'action must be start or stop' };
  const freq = body.freq ?? 'once';
  if (freq === 'once') return onceSpec(action, body);
  if (freq !== 'daily' && freq !== 'weekly') return { ok: false, error: 'freq must be once, daily or weekly' };
  return recurringSpec(action, freq, body);
}

/** Next local-time occurrence of HH:MM, optionally pinned to a weekday. */
function nextAfter(time: string, dow: number | null): number {
  const [hh, mm] = time.split(':').map(Number);
  const candidate = new Date();
  candidate.setHours(hh, mm, 0, 0);
  for (let i = 0; i < 14; i++) {
    if (candidate.getTime() <= now()) { candidate.setDate(candidate.getDate() + 1); continue; }
    if (dow === null || candidate.getDay() === dow) return candidate.getTime();
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

/** Advance next_run after a fire. One-shots complete; recurring roll forward. */
function advance(spec: { freq: ScheduleFreq; dailyTime: string | null; weeklyDow: number | null }): { nextRun: number; status: 'active' | 'done' } {
  if (spec.freq === 'once') return { nextRun: 0, status: 'done' };
  return { nextRun: nextAfter(spec.dailyTime ?? '00:00', spec.weeklyDow), status: 'active' };
}

export function insertSchedule(
  userId: string, instanceId: string,
  spec: { action: 'start' | 'stop'; runAt: number | null; dailyTime: string | null; weeklyDow: number | null; nextRun: number },
): string {
  const id = newId('sch_');
  rawDb().prepare(
    `insert into scheduled_ops (id, user_id, instance_id, action, run_at, daily_time, weekly_dow, next_run, status, created_at)
     values (?,?,?,?,?,?,?,?,'active',?)`,
  ).run(id, userId, instanceId, spec.action, spec.runAt, spec.dailyTime, spec.weeklyDow, spec.nextRun, now());
  return id;
}

export function listSchedules(userId: string, isAdmin: boolean): ScheduledOp[] {
  const sql = isAdmin
    ? `select * from scheduled_ops order by next_run asc limit 200`
    : `select * from scheduled_ops where user_id=? order by next_run asc limit 200`;
  return rawDb().prepare(sql).all(...(isAdmin ? [] : [userId])) as ScheduledOp[];
}

export function cancelSchedule(userId: string, id: string, isAdmin: boolean): boolean {
  const sql = isAdmin
    ? `update scheduled_ops set status='cancelled' where id=? and status='active'`
    : `update scheduled_ops set status='cancelled' where id=? and user_id=? and status='active'`;
  return rawDb().prepare(sql).run(...(isAdmin ? [id] : [id, userId])).changes > 0;
}

/**
 * Fire every due schedule. Called from the worker tick. A schedule whose
 * instance is gone fails permanently; a stopped/started job enqueues normally
 * and the reconciler's own checks still apply downstream.
 */
export async function runDueSchedules(): Promise<number> {
  const due = rawDb().prepare(
    `select * from scheduled_ops where status='active' and next_run <= ? order by next_run asc limit 20`,
  ).all(now()) as ScheduledOp[];
  let fired = 0;
  for (const op of due) {
    const inst = rawDb().prepare(`select id, name, status, user_id from instances where id=?`).get(op.instance_id) as
      | { id: string; name: string; status: string; user_id: string } | undefined;
    if (!inst) {
      rawDb().prepare(`update scheduled_ops set status='failed', last_error='instance no longer exists' where id=?`).run(op.id);
      continue;
    }
    const jobType = op.action === 'start' ? 'instance.start' : 'instance.stop';
    await enqueue({ type: jobType, instanceId: inst.id, userId: inst.user_id });
    const spec = { freq: op.daily_time ? (op.weekly_dow !== null ? 'weekly' : 'daily') as ScheduleFreq : 'once' as const, dailyTime: op.daily_time, weeklyDow: op.weekly_dow };
    const { nextRun, status } = advance(spec);
    rawDb().prepare(`update scheduled_ops set next_run=?, last_run=?, status=?, last_error=null where id=?`)
      .run(nextRun, now(), status, op.id);
    notify(inst.user_id, 'info', `${inst.name}: scheduled ${op.action} ran`, '', `/instances/${inst.id}`);
    logInfo(`[scheduler] fired ${op.action} for ${inst.name} (${op.id})`);
    fired += 1;
  }
  return fired;
}
