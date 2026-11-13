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

import os from 'os';
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { now } from '@/lib/core/util';

export type Quota = {
  maxVms: number | null;
  maxVcpus: number | null;
  maxMemoryMb: number | null;
  maxDiskGb: number | null;
  maxRunning: number | null;
  /** ISO tier: uploads held and their combined GB. NULL = global caps only. */
  maxIsoCount: number | null;
  maxIsoTotalGb: number | null;
  /** Tenant containers: count, summed memory (MB) and summed vCPUs. */
  maxContainers: number | null;
  maxContainerMemMb: number | null;
  maxContainerCpus: number | null;
  suspended: boolean;
  note: string | null;
};

export type Usage = {
  vms: number;
  running: number;
  vcpus: number;
  memoryMb: number;
  diskGb: number;
  isos: number;
  isoGb: number;
  containers: number;
  containerMemMb: number;
  containerCpus: number;
};

/** No quota row means "no limit set", not "denied". */
export function getQuota(userId: string): Quota {
  const quotaRow = rawDb()
    .prepare(
      `select max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running,
              max_iso_count, max_iso_total_gb, max_containers,
              max_container_mem_mb, max_container_cpus, suspended, note
       from quotas where user_id = ?`,
    )
    .get(userId) as
    | { max_vms: number | null; max_vcpus: number | null; max_memory_mb: number | null; max_disk_gb: number | null; max_running: number | null; max_iso_count: number | null; max_iso_total_gb: number | null; max_containers: number | null; max_container_mem_mb: number | null; max_container_cpus: number | null; suspended: number; note: string | null }
    | undefined;
  if (!quotaRow) {
    return { maxVms: null, maxVcpus: null, maxMemoryMb: null, maxDiskGb: null, maxRunning: null, maxIsoCount: null, maxIsoTotalGb: null, maxContainers: null, maxContainerMemMb: null, maxContainerCpus: null, suspended: false, note: null };
  }
  return {
    maxVms: quotaRow.max_vms,
    maxVcpus: quotaRow.max_vcpus,
    maxMemoryMb: quotaRow.max_memory_mb,
    maxDiskGb: quotaRow.max_disk_gb,
    maxRunning: quotaRow.max_running,
    maxIsoCount: quotaRow.max_iso_count,
    maxIsoTotalGb: quotaRow.max_iso_total_gb,
    maxContainers: quotaRow.max_containers,
    maxContainerMemMb: quotaRow.max_container_mem_mb,
    maxContainerCpus: quotaRow.max_container_cpus,
    suspended: !!quotaRow.suspended,
    note: quotaRow.note,
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
function isoUsage(userId: string): { n: number; bytes: number } {
  return rawDb()
    .prepare(`select count(*) as n, coalesce(sum(size_bytes),0) as bytes from iso_uploads where owner_id=?`)
    .get(userId) as { n: number; bytes: number };
}

function containerUsage(userId: string): { n: number; memMb: number; cpus: number } {
  return rawDb()
    .prepare(
      `select count(*) as n, coalesce(sum(memory_mb),0) as memMb, coalesce(sum(cpus),0) as cpus
       from user_containers where user_id=?`,
    )
    .get(userId) as { n: number; memMb: number; cpus: number };
}

function vmUsage(userId: string): { vms: number; running: number | null; vcpus: number; memoryMb: number; diskGb: number } {
  return rawDb()
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
}

function combineUsage(vm: ReturnType<typeof vmUsage>, iso: { n: number; bytes: number }, ct: { n: number; memMb: number; cpus: number }): Usage {
  const v = { ...vm };
  const i = { ...iso };
  const c = { ...ct };
  return {
    vms: v.vms, running: v.running ?? 0, vcpus: v.vcpus, memoryMb: v.memoryMb, diskGb: v.diskGb,
    isos: i.n, isoGb: Math.round((i.bytes / 1024 ** 3) * 10) / 10,
    containers: c.n, containerMemMb: Math.round(c.memMb), containerCpus: Math.round(c.cpus * 100) / 100,
  };
}

export function getUsage(userId: string): Usage {
  return combineUsage(vmUsage(userId), isoUsage(userId), containerUsage(userId));
}

/** Everything the host has committed across ALL users. */
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
  const usageRow = rawDb()
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
  return { vms: usageRow.vms ?? 0, running: 0, vcpus: usageRow.vcpus ?? 0, memoryMb: usageRow.memoryMb ?? 0, diskGb: usageRow.diskGb ?? 0, isos: 0, isoGb: 0, containers: 0, containerMemMb: 0, containerCpus: 0 };
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
    isos: held.isos,
    isoGb: held.isoGb,
    containers: held.containers,
    containerMemMb: held.containerMemMb,
    containerCpus: held.containerCpus,
  };
}

export type Deny = { allowed: false; reason: string };
export type Allow = { allowed: true };
export type Verdict = Allow | Deny;

const fmtGb = (mb: number) => (mb / 1024).toFixed(1);

type QuotaRow = ReturnType<typeof getQuota>;
type Committed = ReturnType<typeof getCommittedForNew>;

/** An admin minted the account but has not granted anything yet. */
function zeroAllocation(quotaRow: QuotaRow): boolean {
  return quotaRow.maxVms === 0 && quotaRow.maxVcpus === 0 && quotaRow.maxMemoryMb === 0 && quotaRow.maxDiskGb === 0;
}

function checkVms(quotaRow: QuotaRow, usage: Committed): Deny | null {
  if (quotaRow.maxVms === null || usage.vms < quotaRow.maxVms) return null;
  // "0 of 0" is a confusing way to say "not allocated".
  if (zeroAllocation(quotaRow)) {
    return { allowed: false, reason: 'this account has no allocation yet — ask an admin to grant one' };
  }
  return { allowed: false, reason: `instance limit reached: you already have or have asked for ${usage.vms} of ${quotaRow.maxVms}. Delete one or cancel a request, or ask an admin to raise your quota.` };
}

function checkVcpus(quotaRow: QuotaRow, usage: Committed, plan: { vcpu: number }): Deny | null {
  if (quotaRow.maxVcpus === null || usage.vcpus + plan.vcpu <= quotaRow.maxVcpus) return null;
  return { allowed: false, reason: `vCPU limit reached: this needs ${plan.vcpu} more and you have ${usage.vcpus} of ${quotaRow.maxVcpus} committed.` };
}

function checkMemory(quotaRow: QuotaRow, usage: Committed, plan: { ramMb: number }): Deny | null {
  if (quotaRow.maxMemoryMb === null || usage.memoryMb + plan.ramMb <= quotaRow.maxMemoryMb) return null;
  return { allowed: false, reason: `memory limit reached: this needs ${plan.ramMb} MB more and you have ${usage.memoryMb} of ${quotaRow.maxMemoryMb} MB committed.` };
}

function checkDisk(quotaRow: QuotaRow, usage: Committed, plan: { diskGb: number }): Deny | null {
  if (quotaRow.maxDiskGb === null || usage.diskGb + plan.diskGb <= quotaRow.maxDiskGb) return null;
  return { allowed: false, reason: `disk limit reached: this needs ${plan.diskGb} GB more and you have ${usage.diskGb} of ${quotaRow.maxDiskGb} GB committed.` };
}

function checkRunning(quotaRow: QuotaRow, usage: Committed): Deny | null {
  if (quotaRow.maxRunning === null || usage.running < quotaRow.maxRunning) return null;
  return { allowed: false, reason: `running instance limit reached: ${usage.running} of ${quotaRow.maxRunning} running. Stop one first.` };
}

/** The user-level refusals, in the order they are easiest to explain. */
function checkUserLimits(quotaRow: QuotaRow, usage: Committed, plan: { vcpu: number; ramMb: number; diskGb: number }): Deny | null {
  return checkVms(quotaRow, usage)
    ?? checkVcpus(quotaRow, usage, plan)
    ?? checkMemory(quotaRow, usage, plan)
    ?? checkDisk(quotaRow, usage, plan)
    ?? checkRunning(quotaRow, usage);
}

export { checkIsoUpload, checkContainerQuota } from '@/lib/core/resourcequota';

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
  const quotaRow = getQuota(userId);
  if (quotaRow.suspended) {
    return { allowed: false, reason: 'your account is suspended — contact an admin' };
  }
  const usage = getCommittedForNew(userId, opts.excludeRequestId);
  // An admin creating on someone's behalf is still bound by the HOST's limits,
  // but not by that user's quota: an admin overriding a customer quota is a
  // deliberate act, not an accident.
  if (opts.isAdmin) return checkHostCapacity(plan);
  return checkUserLimits(quotaRow, usage, plan) ?? checkHostCapacity(plan);
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

/**
 * Give a brand-new account its opening quota: zero of everything.
 *
 * getQuota() treats a MISSING row as unlimited, which is the right default for
 * accounts that already exist (nobody gets retro-locked by a deploy) but the
 * wrong default for an account an admin just minted — that one should hold
 * nothing until someone decides what it may hold. So the row is written
 * explicitly at creation time, and it is insert-only: re-running it must never
 * overwrite bounds an admin has since set.
 */
export function grantDefaultQuota(userId: string): void {
  const defaultQuota = config.limits.defaultQuota;
  rawDb()
    .prepare(
      `insert into quotas (user_id, max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running,
                           max_iso_count, max_iso_total_gb, max_containers, max_container_mem_mb, max_container_cpus,
                           suspended, note, updated_at)
       values (?,?,?,?,?,?,0,0,0,0,0,0,?,?)
       on conflict(user_id) do nothing`,
    )
    .run(userId, defaultQuota.maxVms, defaultQuota.maxVcpus, defaultQuota.maxMemoryMb, defaultQuota.maxDiskGb, defaultQuota.maxRunning, 'no allocation yet', now());
}
