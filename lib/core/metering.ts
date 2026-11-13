/**
 * Metering. A 15-minute sampler records one usage row per running instance
 * (weight = fractional HOURS lived in that window). An hourly settlement
 * stage converts unsampled weight into ledger debits against the user's
 * balance, honoring the plan's monthly cap (extra hours past the cap are
 * simply not billed — never negative billing). Suspend-at-zero belongs to
 * the reconciler: metering records truth, reconciler acts on it.
 */

import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { newId } from './crypto';
import { now } from './util';
import { logInfo } from '@/lib/core/log';

const SAMPLE_MIN = config.meters.sampleIntervalMin;

let sampleTimer: ReturnType<typeof setInterval> | null = null;
let settleTimer: ReturnType<typeof setInterval> | null = null;

export function startMetering(): void {
  if (sampleTimer) return;
  sampleTimer = setInterval(() => { void samplePass().catch((e) =>
    logInfo('[metering] sample failed:', (e as Error).message)); }, SAMPLE_MIN * 60 * 1000);
  // settle every hour at :05
  settleTimer = setInterval(() => { void settleAll().catch((e) =>
    logInfo('[metering] settle-all failed:', (e as Error).message)); }, 3600 * 1000);
  logInfo(`[metering] sampler ${SAMPLE_MIN}min, settle hourly`);
}

export function stopMetering(): void {
  if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = null; }
  if (settleTimer) { clearInterval(settleTimer); settleTimer = null; }
}

/** Record a usage sample for every running instance. */
export async function samplePass(): Promise<number> {
  const db = rawDb();
  const rows = db
    .prepare(`select id from instances where status='running'`)
    .all() as { id: string }[];
  const ts = now();
  const ins = db.prepare(
    `insert into usage (id, instance_id, running, weight, ts) values (?,?,1,?,?)`,
  );
  const tx = db.transaction(() => {
    for (const instanceRow of rows) ins.run(newId('use_'), instanceRow.id, SAMPLE_MIN / 60, ts);
  });
  tx();
  if (rows.length) logInfo(`[metering] sampled ${rows.length} running instance(s)`);
  return rows.length;
}

export async function settleAll(): Promise<number> {
  const db = rawDb();
  const rows = db.prepare(`select distinct user_id from instances`).all() as { user_id: string }[];
  for (const userRow of rows) {
    try { void settleUser(userRow.user_id); } catch (e) {
      logInfo(`[metering] settle ${userRow.user_id} failed:`, (e as Error).message);
    }
  }
  return rows.length;
}

/**
 * Settle one user: aggregate unsettled running hours per instance, cap at the
 * plan's monthly cap, debit the balance, write a ledger row per settle.
 * Returns total cents debited.
 */
export async function settleUser(userId: string): Promise<number> {
  const db = rawDb();
  const cutoff = now() - 1000; // heartbeat margin
  const rows = db.prepare(`
    select i.id as inst, i.user_id as uid, i.rate_hourly_cents as rate,
           i.monthly_cap_min as cap, i.last_settle_at as last,
           coalesce(sum(u.weight), 0) as hours
    from instances i
    join usage u on u.instance_id = i.id and u.ts > i.last_settle_at and u.ts <= ?
    where i.user_id = ? and u.running = 1
    group by i.id
  `).all(cutoff, userId) as { inst: string; uid: string; rate: number; cap: number; last: number; hours: number }[];

  let total = 0;
  for (const usageRow of rows) {
    // Monthly cap: hours already accrued this month (settled + unsettled).
    const monthStart = startOfMonthTs();
    const billed = (db.prepare(`
      select coalesce(sum(u.weight),0) as h from usage u
      where u.instance_id = ? and u.ts >= ? and u.running = 1
    `).get(usageRow.inst, monthStart) as { h: number } | undefined)?.h ?? usageRow.hours;
    const leftHours = Math.max(0, usageRow.cap / 60 - billed);
    const chargeable = Math.min(usageRow.hours, leftHours);
    const cents = Math.round(chargeable * usageRow.rate);
    db.transaction(() => {
      db.prepare(`update users set balance_cents = balance_cents - ? where id = ?`).run(cents, userId);
      db.prepare(`insert into ledger (id, user_id, delta_cents, reason, ref_type, ref_id, note, created_at)
        values (?,?,?,?,?,?,?,?)`).run(
        newId('led_'), userId, -cents, 'meter', 'instance', usageRow.inst,
        `${chargeable.toFixed(2)}h @ ${(usageRow.rate / 100).toFixed(2)}/h`, now(),
      );
      db.prepare(`update instances set last_settle_at = ?, updated_at = ? where id = ?`).run(now(), now(), usageRow.inst);
    })();
    total += cents;
  }
  if (total > 0) logInfo(`[metering] settled ${userId}: -${total}c`);
  return total;
}

/** Top up (admin): positive delta, ledger row 'topup'. */
export function grantCents(userId: string, deltaCents: number, note: string): void {
  const db = rawDb();
  db.transaction(() => {
    db.prepare(`update users set balance_cents = balance_cents + ? where id = ?`).run(deltaCents, userId);
    db.prepare(`insert into ledger (id, user_id, delta_cents, reason, ref_type, ref_id, note, created_at)
      values (?,?,?,?,?,?,?,?)`).run(
      newId('led_'), userId, deltaCents, 'topup', 'admin', null, note, now(),
    );
  })();
}

function startOfMonthTs(): number {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}
