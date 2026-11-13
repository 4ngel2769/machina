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
import { ignore } from '@/lib/core/ignore';
import { logInfo } from '@/lib/core/log';

export const THROTTLE_KBS = 128; // ~1 Mbps each way once over quota
export const GB = 1024 * 1024 * 1024;

let timer: ReturnType<typeof setInterval> | null = null;

export function startNetmeter(intervalMs = 15 * 60 * 1000): void {
  if (timer) return;
  timer = setInterval(() => { void sampleNetPass().catch((sampleError) =>
    logInfo('[netmeter] sample failed:', (sampleError as Error).message)); }, intervalMs);
  logInfo('[netmeter] sampler 15min');
}

export function stopNetmeter(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
  const domToInstance = new Map((db.prepare(
    `select id, domain_name from instances`,
  ).all() as { id: string; domain_name: string }[]).map((row) => [row.domain_name, row.id]));
  const month = monthKey();
  let touched = 0;
  const up = db.prepare(`update net_monthly set rx_bytes=rx_bytes+?, tx_bytes=tx_bytes+?,
    rx_last=?, tx_last=?, updated_at=? where instance_id=? and month=?`);
  for (const ifaceStats of stats) {
    const instanceId = domToInstance.get(ifaceStats.domain);
    if (!instanceId) continue; // not ours (lab VMs etc.)
    const row = getRow(instanceId, month);
    const deltaRx = ifaceStats.rxBytes >= row.rx_last ? ifaceStats.rxBytes - row.rx_last : ifaceStats.rxBytes;
    const deltaTx = ifaceStats.txBytes >= row.tx_last ? ifaceStats.txBytes - row.tx_last : ifaceStats.txBytes;
    up.run(deltaRx, deltaTx, ifaceStats.rxBytes, ifaceStats.txBytes, now(), instanceId, month);
    touched += 1;
  }
  if (touched) logInfo(`[netmeter] sampled ${touched} instance(s)`);
  return touched;
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
async function throttleInstance(instanceRow: InstRow, used: number, quota: number, month: string): Promise<void> {
  rawDb().prepare(`update net_monthly set throttled=1, updated_at=? where instance_id=? and month=?`)
    .run(now(), instanceRow.id, month);
  if (instanceRow.status === 'running') {
    await tuneIface(instanceRow.domain_name, instanceRow.mac, THROTTLE_KBS, THROTTLE_KBS).catch(ignore('iface may not exist yet'));
  }
  await logAudit({ action: 'net.throttled', target: instanceRow.id,
    detail: { usedGb: +(used / GB).toFixed(2), quotaGb: quota } });
  logInfo(`[netmeter] throttled ${instanceRow.id} (${(used / GB).toFixed(2)}/${quota}GB)`);
}

/** Back under quota (raised limit, or a fresh month row): clear flag and limit. */
async function unthrottleInstance(instanceRow: InstRow, used: number, quota: number, month: string): Promise<void> {
  rawDb().prepare(`update net_monthly set throttled=0, updated_at=? where instance_id=? and month=?`)
    .run(now(), instanceRow.id, month);
  if (instanceRow.status === 'running') {
    await tuneIface(instanceRow.domain_name, instanceRow.mac, 0, 0).catch(ignore('iface may not exist'));
  }
  await logAudit({ action: 'net.unthrottled', target: instanceRow.id,
    detail: { usedGb: +(used / GB).toFixed(2), quotaGb: quota } });
  logInfo(`[netmeter] unthrottled ${instanceRow.id}`);
}

/** Flag set but the live limit was lost (e.g. libvirt restart): put it back. */
async function healThrottle(instanceRow: InstRow): Promise<void> {
  const currentTune = await readIfaceTune(instanceRow.domain_name, instanceRow.mac).catch(() => null);
  if (!currentTune || (currentTune.inAvg === THROTTLE_KBS && currentTune.outAvg === THROTTLE_KBS)) return;
  await tuneIface(instanceRow.domain_name, instanceRow.mac, THROTTLE_KBS, THROTTLE_KBS).catch(ignore('iface may not exist yet'));
  logInfo(`[netmeter] re-applied throttle ${instanceRow.id}`);
}

type QuotaAction = 'throttle' | 'clear' | 'heal' | 'none';

/** Over/under the quota plus the stored flag decide the one thing to do. */
function quotaAction(isOver: boolean, isFlagged: boolean, isRunning: boolean): QuotaAction {
  if (isOver && !isFlagged) return 'throttle';
  if (!isOver && isFlagged) return 'clear';
  if (isOver && isFlagged && isRunning) return 'heal';
  return 'none';
}

async function applyQuotaAction(
  action: QuotaAction, instanceRow: InstRow, used: number, quota: number, month: string,
): Promise<void> {
  if (action === 'throttle') await throttleInstance(instanceRow, used, quota, month);
  else if (action === 'clear') await unthrottleInstance(instanceRow, used, quota, month);
  else if (action === 'heal') await healThrottle(instanceRow);
}

/**
 * Quota pass (called from the reconciler loop + after each sample).
 * Over-quota -> set flag + live domiftune limit. Under-quota-but-flagged
 * (quota raised, or fresh month row) -> clear the live limit + flag.
 */
export async function checkQuotas(): Promise<{ throttled: number; cleared: number }> {
  const result = { throttled: 0, cleared: 0 };
  const db = rawDb();
  const month = monthKey();
  const instanceRows = db.prepare(
    `select id, domain_name, mac, status, bandwidth_gb from instances`,
  ).all() as InstRow[];
  for (const instanceRow of instanceRows) {
    const quotaGb = instanceRow.bandwidth_gb ?? 0;
    if (!(quotaGb > 0)) continue; // 0 = unlimited
    const row = getRow(instanceRow.id, month);
    const used = row.rx_bytes + row.tx_bytes;
    const action = quotaAction(used > quotaGb * GB, row.throttled === 1, instanceRow.status === 'running');
    if (action === 'none') continue;
    try {
      await applyQuotaAction(action, instanceRow, used, quotaGb, month);
      if (action === 'throttle') result.throttled += 1;
      else if (action === 'clear') result.cleared += 1;
    } catch (quotaError) {
      logInfo(`[netmeter] quota ${instanceRow.id} failed:`, (quotaError as Error).message);
    }
  }
  return result;
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
  await tuneIface(domainName, mac, THROTTLE_KBS, THROTTLE_KBS).catch(ignore('iface may not exist'));
}
