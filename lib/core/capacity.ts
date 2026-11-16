/**
 * Host capacity: what the machine itself can still take, independent of any
 * user's quota. Split from quota.ts (which answers "may THIS user create
 * another VM") — this file answers "does the HOST have room for it?".
 *
 * Conflating the two is how you either lock a customer out while the box is
 * idle, or hand out VMs until the host swaps.
 */

import os from 'os';
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { now } from '@/lib/core/util';
import type { Usage, Verdict } from '@/lib/core/quotatypes';

/** Everything the host has committed across ALL users (VM plane only). */
export function getHostCommitted(): Usage {
  const usageRow = rawDb()
    .prepare(
      `select
         count(*) as vms,
         sum(case when i.status = 'running' then 1 else 0 end) as running,
         coalesce(sum(p.vcpu), 0) as vcpus,
         coalesce(sum(p.ram_mb), 0) as memoryMb,
         coalesce(sum(p.disk_gb), 0) as diskGb
       from instances i join plans p on p.id = i.plan_id`,
    )
    .get() as { vms: number; running: number | null; vcpus: number; memoryMb: number; diskGb: number };
  return {
    vms: usageRow.vms ?? 0,
    running: usageRow.running ?? 0,
    vcpus: usageRow.vcpus ?? 0,
    memoryMb: usageRow.memoryMb ?? 0,
    diskGb: usageRow.diskGb ?? 0,
    isos: 0,
    isoGb: 0,
    containers: 0,
    containerMemMb: 0,
    containerCpus: 0,
  };
}

export type Capacity = {
  /** Physical RAM on the host, MiB. 0 when unknown (then no memory ceiling). */
  memoryMb: number;
  /** Logical CPUs. 0 when unknown. */
  vcpus: number;
  /** Overcommit allowed on RAM. 1.0 = never hand out more than physical. */
  ramOvercommit: number;
};

/**
 * Host capacity, read once and cached briefly. The expensive half is a
 * libvirt/nodes query; provisioning must not block on it, and a stale figure
 * seconds old is fine for a capacity guard that exists to prevent catastrophe,
 * not to micro-manage allocation.
 */
let capCache: { at: number; cap: Capacity } | null = null;

export function hostCapacity(ttlMs = 60_000, clock: () => number = now): Capacity {
  if (capCache && clock() - capCache.at < ttlMs) return capCache.cap;
  let memoryMb = 0;
  let vcpus = 0;
  try {
    // os.totalmem() reflects the container/host view; on a bare metal host that
    // is the machine. 0 means "unknown", which disables the ceiling rather than
    // silently blocking every create. Imported, not require()d: the Next server
    // bundle is ESM and has no `require` in scope.
    memoryMb = Math.floor(os.totalmem() / 1024 / 1024);
    vcpus = os.cpus().length;
  } catch {
    memoryMb = 0;
    vcpus = 0;
  }
  const cap: Capacity = {
    memoryMb,
    vcpus,
    ramOvercommit: Number(process.env.MACHINA_RAM_OVERCOMMIT || '1.5'),
  };
  capCache = { at: clock(), cap };
  return cap;
}

export function invalidateCapacity(): void {
  capCache = null;
}

const fmtGb = (mb: number) => (mb / 1024).toFixed(1);

/** Is the HOST able to take this VM? Independent of whose it is. */
export function checkHostCapacity(plan: { vcpu: number; ramMb: number; diskGb: number }): Verdict {
  const committed = getHostCommitted();
  const cap = hostCapacity();

  if (committed.running >= config.limits.maxRunningTotal) {
    return { allowed: false, reason: `host is at its running-instance capacity (${config.limits.maxRunningTotal}) — try later` };
  }

  // Only enforce when the figure is actually known. A zero would make every
  // create fail, which is a far worse failure mode than an unenforceable guard.
  if (cap.memoryMb > 0) {
    const ceiling = Math.floor(cap.memoryMb * cap.ramOvercommit);
    if (committed.memoryMb + plan.ramMb > ceiling) {
      return {
        allowed: false,
        reason: `host memory is committed: ${fmtGb(committed.memoryMb)} GB of ${fmtGb(ceiling)} GB in use, this needs ${fmtGb(plan.ramMb)} GB more`,
      };
    }
  }
  if (cap.vcpus > 0) {
    // vCPU is overcommitted generously; it is a scheduling signal, not RAM.
    const ceiling = cap.vcpus * 8;
    if (committed.vcpus + plan.vcpu > ceiling) {
      return { allowed: false, reason: `host vCPU capacity reached (${committed.vcpus} of ${ceiling} committed)` };
    }
  }
  return { allowed: true };
}
