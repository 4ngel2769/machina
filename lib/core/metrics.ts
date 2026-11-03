import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { domStats } from './driver';
import { now } from './util';

/**
 * Metric sampling. Records RAW cumulative hypervisor counters per running
 * instance; all rates are derived at read time.
 *
 * Three properties this deliberately keeps:
 *
 * 1. It never throws and never blocks provisioning. Metrics are nice to have;
 *    the job worker is not. The sweep is detached from the job timer, guarded
 *    by its own in-flight flag, and a failing instance is skipped.
 *
 * 2. It records counters, not percentages. A CPU percentage is only
 *    meaningful against a previous sample and a wall-clock delta, so storing
 *    the rate would bake in the sample interval and make a missed tick read as
 *    a drop to zero. Storing counters means a missed tick just averages over
 *    a longer window.
 *
 * 3. It samples only what the hypervisor can actually see: vCPU runtime and
 *    disk I/O. Guest RAM is NOT sampled as "used", because balloon.current
 *    reports 100% on every guest here regardless of what the guest is doing
 *    (verified across Ubuntu and Alpine). Reporting that as RAM usage would be
 *    a chart that lies. See readMetrics() for what we surface instead.
 */

let inFlight = false;

export async function sampleMetrics(): Promise<void> {
  if (inFlight) return; // a slow sweep must not stack behind itself
  inFlight = true;
  try {
    const rd = rawDb();
    const rows = rd
      .prepare(`select id, domain_name from instances where status = 'running'`)
      .all() as { id: string; domain_name: string }[];
    if (rows.length === 0) return;

    const ts = now();
    const ins = rd.prepare(
      `insert into metrics (instance_id, ts, cpu_ns, ncpu, ram_kb, ram_max_kb, rd_b, wr_b, alloc_b)
       values (?,?,?,?,?,?,?,?,?)
       on conflict(instance_id, ts) do update set
         cpu_ns=excluded.cpu_ns, ncpu=excluded.ncpu, ram_kb=excluded.ram_kb,
         ram_max_kb=excluded.ram_max_kb, rd_b=excluded.rd_b,
         wr_b=excluded.wr_b, alloc_b=excluded.alloc_b`,
    );

    for (const r of rows) {
      let s;
      try {
        s = await domStats(r.domain_name);
      } catch {
        continue; // one unreachable guest must not abort the sweep
      }
      if (!s) continue;
      try {
        ins.run(r.id, ts, Math.round(s.cpuTimeNs), s.ncpu, s.ramKb, s.ramMaxKb,
          s.rdBytes, s.wrBytes, s.allocBytes);
      } catch (e) {
        console.log(`[metrics] insert failed for ${r.id}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.log(`[metrics] sweep failed: ${(e as Error).message}`);
  } finally {
    inFlight = false;
  }
}

/** Drop samples past the retention window. Cheap; called hourly. */
export function pruneMetrics(): void {
  try {
    const rd = rawDb();
    const n = rd.prepare(`delete from metrics where ts < ?`).run(now() - config.metrics.retainMs).changes;
    if (n > 0) console.log(`[metrics] pruned ${n} sample(s) older than ${Math.round(config.metrics.retainMs / 3600000)}h`);
  } catch (e) {
    console.log(`[metrics] prune failed: ${(e as Error).message}`);
  }
}

export type MetricPoint = {
  t: number;
  /** Percent of one vCPU-second per wall second, summed over vcpus: 100 = all vCPUs saturated. */
  cpu: number;
  /** Bytes/second on the guest disk. */
  read: number;
  write: number;
};

/**
 * Derive a rate series from raw counters.
 *
 * `cpu` is a delta of cumulative vCPU nanoseconds over the wall-clock gap,
 * divided by vcpu count. A NEGATIVE delta means the counter reset, which only
 * happens when the domain was destroyed and recreated — that window carries no
 * information, so it is skipped rather than rendered as a huge spike.
 */
export function derivePoints(
  rows: { ts: number; cpuNs: number; ncpu: number; rdB: number; wrB: number }[],
): MetricPoint[] {
  const out: MetricPoint[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const dtMs = b.ts - a.ts;
    if (dtMs <= 0) continue;

    const dCpu = b.cpuNs - a.cpuNs;
    const dRd = b.rdB - a.rdB;
    const dWr = b.wrB - a.wrB;
    if (dCpu < 0 || dRd < 0 || dWr < 0) continue; // counter reset: no honest value

    const ncpu = b.ncpu || a.ncpu || 1;
    // dt is ms -> ns, so cpu% = dCpu / (dt*1e6) / ncpu * 100
    const cpu = Math.max(0, Math.min(100, (dCpu / (dtMs * 1e6)) / ncpu * 100));
    const secs = dtMs / 1000;
    out.push({ t: b.ts, cpu: Math.round(cpu * 10) / 10, read: Math.round(dRd / secs), write: Math.round(dWr / secs) });
  }
  return out;
}

/**
 * Everything the UI needs in one call.
 *
 * `ram` is reported as ALLOCATED (the plan's size) with an explicit
 * `ramObservable: false`. Reporting balloon.current as "used" would show 100%
 * on every guest forever. Saying "we cannot see this" is the honest answer and
 * is why the UI labels it allocated rather than used.
 */
export function readMetrics(instanceId: string, sinceMs: number): {
  points: MetricPoint[];
  allocBytes: number;
  ncpu: number;
  ramAllocKb: number;
  ramObservable: boolean;
  reason: string;
} {
  const rd = rawDb();
  const rows = rd
    .prepare(
      `select ts, cpu_ns as cpuNs, ncpu, ram_kb as ramKb, ram_max_kb as ramMaxKb,
              rd_b as rdB, wr_b as wrB, alloc_b as allocB
       from metrics where instance_id = ? and ts >= ? order by ts asc`,
    )
    .all(instanceId, sinceMs) as
    { ts: number; cpuNs: number; ncpu: number; ramKb: number; ramMaxKb: number; rdB: number; wrB: number; allocB: number }[];

  const last = rows[rows.length - 1];
  return {
    points: derivePoints(rows),
    allocBytes: last?.allocB ?? 0,
    ncpu: last?.ncpu ?? 0,
    ramAllocKb: last?.ramMaxKb ?? 0,
    ramObservable: false,
    reason: 'guest memory usage needs the QEMU guest agent, which is not installed',
  };
}