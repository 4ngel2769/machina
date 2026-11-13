/**
 * Live counters read from the hypervisor: per-interface byte totals, the
 * per-iface throttle, and vCPU/RAM/disk statistics. No guest agent is
 * involved; see the note on domStats.
 */
import fs from 'fs/promises';
import { storagePaths, config } from '@/lib/config';
import { virsh, runBinary } from './exec';

export interface IfaceStat {
  domain: string;
  dev: string;
  rxBytes: number;
  txBytes: number;
}

/** One `domstats --interface` call for every domain; parsed per (domain, net.N). */
export async function domNetStats(): Promise<IfaceStat[]> {
  const out = await virsh(['domstats', '--interface']);
  const stats: IfaceStat[] = [];
  let domain = '';
  const byIdx = new Map<number, { dev: string; rx: number; tx: number }>();
  const flush = () => {
    for (const s of byIdx.values()) {
      if (s.dev) stats.push({ domain, dev: s.dev, rxBytes: s.rx, txBytes: s.tx });
    }
    byIdx.clear();
  };
  for (const line of out.split('\n')) {
    let m = /^Domain: '(.+)'/.exec(line.trim());
    if (m) { flush(); domain = m[1]; continue; }
    m = /^\s*net\.(\d+)\.(name|rx\.bytes|tx\.bytes)=(.+)$/.exec(line);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    const cur = byIdx.get(idx) ?? { dev: '', rx: 0, tx: 0 };
    if (m[2] === 'name') cur.dev = m[3].trim();
    else if (m[2] === 'rx.bytes') cur.rx = parseInt(m[3], 10) || 0;
    else cur.tx = parseInt(m[3], 10) || 0;
    byIdx.set(idx, cur);
  }
  flush();
  return stats;
}

/** Live interface throttle in KB/s. 0/0 clears the limit entirely. */
export async function tuneIface(domain: string, mac: string, inKb: number, outKb: number): Promise<void> {
  await virsh(['domiftune', domain, mac, '--live',
    '--inbound', String(inKb), '--outbound', String(outKb)]);
}

/** Current live averages, or null when the domain/iface is gone. */
export async function readIfaceTune(domain: string, mac: string): Promise<{ inAvg: number; outAvg: number } | null> {
  let out: string;
  try {
    out = await virsh(['domiftune', domain, mac, '--current']);
  } catch {
    return null;
  }
  const gi = (k: string): number => {
    const m = new RegExp(`^${k}:\\s*(\\d+)`, 'm').exec(out);
    return m ? parseInt(m[1], 10) : 0;
  };
  return { inAvg: gi('inbound\\.average'), outAvg: gi('outbound\\.average') };
}

/** Real bytes occupied by the overlay (data + internal snapshot deltas), and
 *  the free space left on the pool that holds it. Both are quota inputs. */
export async function diskUsage(
  volName: string,
): Promise<{ actualBytes: number; virtualBytes: number; freeMb: number } | null> {
  try {
    const { stdout } = await runBinary(config.qemuImgBin, [
      // -U (force share) is mandatory, not an optimisation: a running domain
      // holds an exclusive write lock on this qcow2, so a plain `qemu-img info`
      // fails with "Failed to get shared write lock" for exactly the instances
      // whose usage we most want to see.
      'info', '-U', '--output=json', `-f`, 'qcow2', `${storagePaths().vms}/${volName}.qcow2`,
    ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    const info = JSON.parse(stdout) as { 'actual-size': number; 'virtual-size': number };
    let freeMb = 0;
    try {
      const st = await fs.statfs(storagePaths().vms);
      // statfs: bsize * bavail = bytes available to an unprivileged writer
      freeMb = Math.floor((Number(st.bsize) * Number(st.bavail)) / (1024 * 1024));
    } catch {
      freeMb = 0;
    }
    return {
      actualBytes: Number(info['actual-size']) || 0,
      virtualBytes: Number(info['virtual-size']) || 0,
      freeMb,
    };
  } catch {
    return null; // no disk yet, or unreadable: caller decides what that means
  }
}

export type DomStats = {
  /** Cumulative guest vCPU runtime in nanoseconds, summed over all vcpus. */
  cpuTimeNs: number;
  ncpu: number;
  /** Guest RAM actually in use, KiB (balloon.current). */
  ramKb: number;
  /** RAM the guest was given, KiB (balloon.maximum). */
  ramMaxKb: number;
  rdBytes: number;
  wrBytes: number;
  /** Bytes the hypervisor has allocated for the guest disk. */
  allocBytes: number;
};

/** `key=value` lines from `virsh domstats` into a lookup table. */
function parseStatsOutput(out: string): Map<string, string> {
  const kv = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^\s*([\w.]+)=(\S+)\s*$/.exec(line);
    if (m) kv.set(m[1], m[2]);
  }
  return kv;
}

/** Sum vcpu.N.time, falling back to the configured count for a guest that
 *  never ran so CPU% divides by the right denominator and reads 0. */
function sumCpuTime(kv: Map<string, string>): { cpuTimeNs: number; ncpu: number } {
  let cpuTimeNs = 0;
  let ncpu = 0;
  for (const [k, v] of kv) {
    const m = /^vcpu\.(\d+)\.time$/.exec(k);
    if (!m) continue;
    const t = Number(v);
    if (Number.isFinite(t)) { cpuTimeNs += t; ncpu += 1; }
  }
  if (!ncpu) ncpu = Number(kv.get('vcpu.current') ?? 0) || 0;
  return { cpuTimeNs, ncpu };
}

/** block.N counters are per disk. Pick the guest disk by its path: the vms/
 *  pool is the instance's own disk, seeds/ is the read-only cloud-init ISO
 *  whose write counters are meaningless noise. */
function sumDiskIo(kv: Map<string, string>): { rdBytes: number; wrBytes: number; allocBytes: number } {
  const indices = new Set<string>();
  for (const k of kv.keys()) {
    const idx = /^block\.(\d+)\./.exec(k)?.[1];
    if (idx !== undefined) indices.add(idx);
  }
  let rdBytes = 0;
  let wrBytes = 0;
  let allocBytes = 0;
  for (const idx of indices) {
    const path = kv.get(`block.${idx}.path`) ?? '';
    if (!path.includes('/vms/')) continue;
    rdBytes = Number(kv.get(`block.${idx}.rd.bytes`)) || 0;
    wrBytes = Number(kv.get(`block.${idx}.wr.bytes`)) || 0;
    allocBytes = Number(kv.get(`block.${idx}.allocation`)) || 0;
  }
  return { rdBytes, wrBytes, allocBytes };
}

/** Counter lookup with a numeric fallback, rejecting NaN. */
function num(kv: Map<string, string>, key: string): number {
  return Number(kv.get(key) ?? 0) || 0;
}

/**
 * Read a domain's live counters from the HYPERVISOR: cumulative vCPU time,
 * balloon-reported guest RAM, and per-disk I/O counters.
 *
 * Deliberately NOT the QEMU guest agent. The agent is a QMP-style RPC channel
 * that runs commands inside the guest — effectively root in every rented VM,
 * and a per-tenant attack surface on a multi-tenant host. Everything needed for
 * a load chart is already here, works on all six distros, and needs nothing
 * installed in the guest. The cost is that guest-visible filesystem usage is
 * unavailable, which the disk allocation figure covers well enough.
 *
 * Returns null for a domain that is gone or shut off rather than throwing, so
 * one dead guest cannot abort a sweep over the others.
 */
export async function domStats(domainName: string): Promise<DomStats | null> {
  let out: string;
  try {
    out = await virsh(['domstats', '--domain', domainName, '--vcpu', '--balloon', '--block'], 15_000);
  } catch {
    return null;
  }
  const kv = parseStatsOutput(out);
  const { cpuTimeNs, ncpu } = sumCpuTime(kv);
  const { rdBytes, wrBytes, allocBytes } = sumDiskIo(kv);
  const ramKb = num(kv, 'balloon.current');
  const ramMaxKb = num(kv, 'balloon.maximum');
  const silent = !cpuTimeNs && !ramKb && !rdBytes && !wrBytes && !allocBytes;
  if (silent) return null;
  return { cpuTimeNs, ncpu, ramKb, ramMaxKb, rdBytes, wrBytes, allocBytes };
}
