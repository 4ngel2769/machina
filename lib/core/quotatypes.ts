/**
 * Shared quota vocabulary: the shapes every check and meter agrees on.
 * Lives alone so quota.ts (per-user) and capacity.ts (per-host) can both
 * import it without a cycle.
 */

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
  /** Monthly metered-spend ceiling in cents. NULL = uncapped, 0 = none. */
  maxMonthlySpendCents: number | null;
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

export type Deny = { allowed: false; reason: string };
export type Allow = { allowed: true };
export type Verdict = Allow | Deny;
