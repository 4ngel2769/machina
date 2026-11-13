/**
 * Bandwidth metering. A 15-minute sampler reads libvirt interface counters
 * (`domstats --interface`, one call for all domains) and accumulates monthly
 * rx+tx deltas per instance in net_monthly. Quota enforcement (throttle) is
 * the reconciler's job: metering records truth, reconciler acts on it.
 *
 * Counter resets (domain restart zeroes libvirt stats) are absorbed: a
 * reading below the anchor counts itself as the delta rather than going
 * negative. Throttle state is a live `domiftune` limit plus a per-month DB
 * flag; month rollover creates a fresh row, which naturally clears intent,
 * and the reconciler removes any stale live limit.
 */

import { rawDb } from '@/lib/db';
import { domNetStats, tuneIface, readIfaceTune, domState } from './driver';
import { logAudit } from '@/lib/services/audit';
import { now } from './util';

export const THROTTLE_KBS = 128; // ~1 Mbps each way once over quota
export const GB = 1024 * 1024 * 1024;

let timer: ReturnType<typeof setInterval> | null = null;

export function startNetmeter(intervalMs = 15 * 60 * 1000): void {
  if (timer) return;
  timer = setInterval(() => { void sampleNetPass().catch((e) =>
    console.log('[netmeter] sample failed:', (e as Error).message)); }, intervalMs);
  console.log('[netmeter] sampler 15min');
}

export function stopNetmeter(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface NetRow {
  instance_id: string; month: string;
  rx_bytes: number; tx_bytes: number;
  rx_last: number; tx_last: number;
  throttled: number; updated_at: number;
}

function getRow(instanceId: string, month: string): NetRow {
  const db = rawDb();
  let row = db.prepare(`select * from net_monthly where instance_id=? and month=?`)
    .get(instanceId, month) as NetRow | undefined;
  if (!row) {
    db.prepare(`insert into net_monthly (instance_id, month, updated_at) values (?,?,?)`)
      .run(instanceId, month, now());
    row = db.prepare(`select * from net_monthly where instance_id=? and month=?`)
      .get(instanceId, month) as NetRow;
  }
  return row;
}

/** Accumulate one sample of interface deltas. Returns instances touched. */
export async function sampleNetPass(): Promise<number> {
  const db = rawDb();
  const stats = await domNetStats().catch(() => []);
  if (!stats.length) return 0;
  const domToInst = new Map((db.prepare(
    `select id, domain_name from instances`,
  ).all() as { id: string; domain_name: string }[]).map((r) => [r.domain_name, r.id]));
  const month = monthKey();
  let n = 0;
  const up = db.prepare(`update net_monthly set rx_bytes=rx_bytes+?, tx_bytes=tx_bytes+?,
    rx_last=?, tx_last=?, updated_at=? where instance_id=? and month=?`);
  for (const s of stats) {
    const instId = domToInst.get(s.domain);
    if (!instId) continue; // not ours (lab VMs etc.)
    const row = getRow(instId, month);
    const dRx = s.rxBytes >= row.rx_last ? s.rxBytes - row.rx_last : s.rxBytes;
    const dTx = s.txBytes >= row.tx_last ? s.txBytes - row.tx_last : s.txBytes;
    up.run(dRx, dTx, s.rxBytes, s.txBytes, now(), instId, month);
    n += 1;
  }
  if (n) console.log(`[netmeter] sampled ${n} instance(s)`);
  return n;
}

export interface BwState {
  month: string;
  rxBytes: number; txBytes: number;
  quotaGb: number; throttled: boolean;
}

export function bandState(instanceId: string, quotaGb: number): BwState {
  const month = monthKey();
  const row = getRow(instanceId, month);
  return {
    month,
    rxBytes: row.rx_bytes, txBytes: row.tx_bytes,
    quotaGb, throttled: row.throttled === 1,
  };
}

type InstRow = { id: string; domain_name: string; mac: string; status: string; bandwidth_gb: number };

/** Over quota: set the flag, drop the live limit, tell the audit log. */
async function throttleInstance(inst: InstRow, used: number, quota: number, month: string): Promise<void> {
  rawDb().prepare(`update net_monthly set throttled=1, updated_at=? where instance_id=? and month=?`)
    .run(now(), inst.id, month);
  if (inst.status === 'running') {
    await tuneIface(inst.domain_name, inst.mac, THROTTLE_KBS, THROTTLE_KBS).catch(() => {});
  }
  await logAudit({ action: 'net.throttled', target: inst.id,
    detail: { usedGb: +(used / GB).toFixed(2), quotaGb: quota } });
  console.log(`[netmeter] throttled ${inst.id} (${(used / GB).toFixed(2)}/${quota}GB)`);
}

/** Back under quota (raised limit, or a fresh month row): clear flag and limit. */
async function unthrottleInstance(inst: InstRow, used: number, quota: number, month: string): Promise<void> {
  rawDb().prepare(`update net_monthly set throttled=0, updated_at=? where instance_id=? and month=?`)
    .run(now(), inst.id, month);
  if (inst.status === 'running') {
    await tuneIface(inst.domain_name, inst.mac, 0, 0).catch(() => {});
  }
  await logAudit({ action: 'net.unthrottled', target: inst.id,
    detail: { usedGb: +(used / GB).toFixed(2), quotaGb: quota } });
  console.log(`[netmeter] unthrottled ${inst.id}`);
}

/** Flag set but the live limit was lost (e.g. libvirt restart): put it back. */
async function healThrottle(inst: InstRow): Promise<void> {
  const cur = await readIfaceTune(inst.domain_name, inst.mac).catch(() => null);
  if (!cur || (cur.inAvg === THROTTLE_KBS && cur.outAvg === THROTTLE_KBS)) return;
  await tuneIface(inst.domain_name, inst.mac, THROTTLE_KBS, THROTTLE_KBS).catch(() => {});
  console.log(`[netmeter] re-applied throttle ${inst.id}`);
}

type QuotaAction = 'throttle' | 'clear' | 'heal' | 'none';

/** Over/under the quota plus the stored flag decide the one thing to do. */
function quotaAction(over: boolean, flagged: boolean, running: boolean): QuotaAction {
  if (over && !flagged) return 'throttle';
  if (!over && flagged) return 'clear';
  if (over && flagged && running) return 'heal';
  return 'none';
}

async function applyQuotaAction(
  action: QuotaAction, inst: InstRow, used: number, quota: number, month: string,
): Promise<void> {
  if (action === 'throttle') await throttleInstance(inst, used, quota, month);
  else if (action === 'clear') await unthrottleInstance(inst, used, quota, month);
  else if (action === 'heal') await healThrottle(inst);
}

/**
 * Quota pass (called from the reconciler loop + after each sample).
 * Over-quota -> set flag + live domiftune limit. Under-quota-but-flagged
 * (quota raised, or fresh month row) -> clear the live limit + flag.
 */
export async function checkQuotas(): Promise<{ throttled: number; cleared: number }> {
  const res = { throttled: 0, cleared: 0 };
  const db = rawDb();
  const month = monthKey();
  const insts = db.prepare(
    `select id, domain_name, mac, status, bandwidth_gb from instances`,
  ).all() as InstRow[];
  for (const inst of insts) {
    const quota = inst.bandwidth_gb ?? 0;
    if (!(quota > 0)) continue; // 0 = unlimited
    const row = getRow(inst.id, month);
    const used = row.rx_bytes + row.tx_bytes;
    const action = quotaAction(used > quota * GB, row.throttled === 1, inst.status === 'running');
    if (action === 'none') continue;
    try {
      await applyQuotaAction(action, inst, used, quota, month);
      if (action === 'throttle') res.throttled += 1;
      else if (action === 'clear') res.cleared += 1;
    } catch (e) {
      console.log(`[netmeter] quota ${inst.id} failed:`, (e as Error).message);
    }
  }
  return res;
}

/** Start-hook: re-apply the live limit when a flagged instance boots. */
export async function ensureThrottleState(instanceId: string, domainName: string): Promise<void> {
  const db = rawDb();
  const row = db.prepare(`select * from net_monthly where instance_id=? and month=?`)
    .get(instanceId, monthKey()) as NetRow | undefined;
  if (!row || row.throttled !== 1) return;
  const mac = (db.prepare(`select mac from instances where id=?`).get(instanceId) as { mac: string } | undefined)?.mac;
  if (!mac) return;
  const live = await domState(domainName).catch(() => null);
  if (!live || !/running/i.test(live)) return;
  await tuneIface(domainName, mac, THROTTLE_KBS, THROTTLE_KBS).catch(() => {});
}
