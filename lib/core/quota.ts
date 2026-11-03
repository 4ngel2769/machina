import os from 'os';
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';

/**
 * Per-user quotas and host capacity.
 *
 * Two separate questions, deliberately kept apart:
 *
 *   "may THIS user create another VM?"  -> their quota
 *   "does the HOST have room for it?"    -> committed capacity
 *
 * Conflating them is how you either lock a customer out while the box is idle,
 * or hand out VMs until the host swaps. Both are wrong.
 *
 * COUNTING RULE: usage counts EVERY instance the user owns, not just running
 * ones. A stopped VM still holds a qcow2 overlay, still has an IP leased, and
 * still costs disk on the pool. Counting only running VMs would let a user
 * stop everything, create a hundred, and then start them all at once.
 */

export type Quota = {
  maxVms: number | null;
  maxVcpus: number | null;
  maxMemoryMb: number | null;
  maxDiskGb: number | null;
  maxRunning: number | null;
  suspended: boolean;
  note: string | null;
};

export type Usage = {
  vms: number;
  running: number;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
};

/** No quota row means "no limit set", not "denied". */
export function getQuota(userId: string): Quota {
  const r = rawDb()
    .prepare(
      `select max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running, suspended, note
       from quotas where user_id = ?`,
    )
    .get(userId) as
    | { max_vms: number | null; max_vcpus: number | null; max_memory_mb: number | null; max_disk_gb: number | null; max_running: number | null; suspended: number; note: string | null }
    | undefined;
  if (!r) {
    return { maxVms: null, maxVcpus: null, maxMemoryMb: null, maxDiskGb: null, maxRunning: null, suspended: false, note: null };
  }
  return {
    maxVms: r.max_vms,
    maxVcpus: r.max_vcpus,
    maxMemoryMb: r.max_memory_mb,
    maxDiskGb: r.max_disk_gb,
    maxRunning: r.max_running,
    suspended: !!r.suspended,
    note: r.note,
  };
}

/**
 * Resources the user has committed across every instance they own.
 *
 * Size is resolved through the instance's CURRENT plan, not a snapshot taken at
 * creation: an instance resized or moved to a bigger plan must consume the
 * bigger quota, or resizing becomes a way to escape a quota for free. The
 * instances table stores plan_id only — there is no vcpu/ram_mb/disk_gb column
 * on it, which cost a round of "no such column: vcpu".
 */
export function getUsage(userId: string): Usage {
  const r = rawDb()
    .prepare(
      `select
         count(*) as vms,
         sum(case when i.status = 'running' then 1 else 0 end) as running,
         coalesce(sum(p.vcpu), 0) as vcpus,
         coalesce(sum(p.ram_mb), 0) as memoryMb,
         coalesce(sum(p.disk_gb), 0) as diskGb
       from instances i join plans p on p.id = i.plan_id
       where i.user_id = ?`,
    )
    .get(userId) as { vms: number; running: number | null; vcpus: number; memoryMb: number; diskGb: number };
  return {
    vms: r.vms ?? 0,
    running: r.running ?? 0,
    vcpus: r.vcpus ?? 0,
    memoryMb: r.memoryMb ?? 0,
    diskGb: r.diskGb ?? 0,
  };
}

/** Everything the host has committed across ALL users. */
export function getHostCommitted(): Usage {
  const r = rawDb()
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
    vms: r.vms ?? 0,
    running: r.running ?? 0,
    vcpus: r.vcpus ?? 0,
    memoryMb: r.memoryMb ?? 0,
    diskGb: r.diskGb ?? 0,
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

export function hostCapacity(ttlMs = 60_000): Capacity {
  if (capCache && Date.now() - capCache.at < ttlMs) return capCache.cap;
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
  capCache = { at: Date.now(), cap };
  return cap;
}

export function invalidateCapacity(): void {
  capCache = null;
}

/**
 * Resources a user has CLAIMED but does not yet hold: pending instance
 * requests.
 *
 * Without this, quota is theatre at request time. A user with a 1-VM quota can
 * fire ten requests, all of which pass (they own zero instances), and only
 * discovers the limit when an admin approves the second one. Counting pending
 * requests makes the quota mean what the user thinks it means, and the
 * reservation is released automatically when a request is declined or expires.
 */
export function getPendingUsage(userId: string, excludeRequestId?: string): Usage {
  const r = rawDb()
    .prepare(
      `select
         count(*) as vms,
         coalesce(sum(p.vcpu), 0) as vcpus,
         coalesce(sum(p.ram_mb), 0) as memoryMb,
         coalesce(sum(p.disk_gb), 0) as diskGb
       from instance_requests r join plans p on p.id = r.plan_id
       where r.user_id = ? and r.status = 'pending' and (? is null or r.id <> ?)`,
    )
    .get(userId, excludeRequestId ?? null, excludeRequestId ?? null) as
    { vms: number; vcpus: number; memoryMb: number; diskGb: number };
  return { vms: r.vms ?? 0, running: 0, vcpus: r.vcpus ?? 0, memoryMb: r.memoryMb ?? 0, diskGb: r.diskGb ?? 0 };
}

/**
 * What a new VM would have to fit into: what they hold PLUS what they have
 * claimed. `excludeRequestId` drops one pending request from the sum, which the
 * approval path must do or approving a request counts it against itself and
 * refuses a request that exactly fits the user's quota.
 */
export function getCommittedForNew(userId: string, excludeRequestId?: string): Usage {
  const held = getUsage(userId);
  const pending = getPendingUsage(userId, excludeRequestId);
  return {
    vms: held.vms + pending.vms,
    running: held.running,
    vcpus: held.vcpus + pending.vcpus,
    memoryMb: held.memoryMb + pending.memoryMb,
    diskGb: held.diskGb + pending.diskGb,
  };
}

export type Deny = { allowed: false; reason: string };
export type Allow = { allowed: true };
export type Verdict = Allow | Deny;

const fmtGb = (mb: number) => (mb / 1024).toFixed(1);

/**
 * Can this user create one more VM of `plan`?
 *
 * Checks, in order of how confusing the failure would be to explain:
 * suspended, then count, then each resource, then the host itself. Returns the
 * FIRST refusal with a sentence the user can act on, because a quota error
 * that says "quota exceeded" and nothing else wastes a support round trip.
 */
export function checkQuota(
  userId: string,
  plan: { vcpu: number; ramMb: number; diskGb: number },
  opts: { isAdmin?: boolean; excludeRequestId?: string } = {},
): Verdict {
  const q = getQuota(userId);

  if (q.suspended) {
    return { allowed: false, reason: 'your account is suspended — contact an admin' };
  }

  const u = getCommittedForNew(userId, opts.excludeRequestId);

  // An admin creating on someone's behalf is still bound by the HOST's limits,
  // but not by that user's quota: an admin overriding a customer quota is a
  // deliberate act, not an accident.
  if (!opts.isAdmin) {
    if (q.maxVms !== null && u.vms >= q.maxVms) {
      return { allowed: false, reason: `instance limit reached: you already have or have asked for ${u.vms} of ${q.maxVms}. Delete one or cancel a request, or ask an admin to raise your quota.` };
    }
    if (q.maxVcpus !== null && u.vcpus + plan.vcpu > q.maxVcpus) {
      return { allowed: false, reason: `vCPU limit reached: this needs ${plan.vcpu} more and you have ${u.vcpus} of ${q.maxVcpus} committed.` };
    }
    if (q.maxMemoryMb !== null && u.memoryMb + plan.ramMb > q.maxMemoryMb) {
      return { allowed: false, reason: `memory limit reached: this needs ${plan.ramMb} MB more and you have ${u.memoryMb} of ${q.maxMemoryMb} MB committed.` };
    }
    if (q.maxDiskGb !== null && u.diskGb + plan.diskGb > q.maxDiskGb) {
      return { allowed: false, reason: `disk limit reached: this needs ${plan.diskGb} GB more and you have ${u.diskGb} of ${q.maxDiskGb} GB committed.` };
    }
    if (q.maxRunning !== null && u.running >= q.maxRunning) {
      return { allowed: false, reason: `running instance limit reached: ${u.running} of ${q.maxRunning} running. Stop one first.` };
    }
  }

  return checkHostCapacity(plan);
}

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

/** Admin view: quota plus current usage for one user, ready to render. */
export function quotaWithUsage(userId: string): { quota: Quota; usage: Usage } {
  return { quota: getQuota(userId), usage: getUsage(userId) };
}

/** Percentage used, or null when unlimited. Used for the usage bars. */
export function pct(used: number, max: number | null): number | null {
  if (max === null || max <= 0) return null;
  return Math.min(100, Math.round((used / max) * 100));
}