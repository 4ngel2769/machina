/** Types for the admin account console. */

export type AdminUser = {
  id: string;
  name: string;
  role: string;
  balanceCents: number;
  createdAt: number;
  imagePickable: number;
  assignedImageId: string | null;
  instanceCount: number;
  keyCount: number;
};

/** One row of /api/quotas — same shape as the quota editor's Row. */
export type Allocation = {
  userId: string;
  name: string;
  role: string;
  balanceCents: number;
  quota: {
    maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null;
    maxDiskGb: number | null; maxRunning: number | null;
    maxIsoCount: number | null; maxIsoTotalGb: number | null;
    maxContainers: number | null; maxContainerMemMb: number | null; maxContainerCpus: number | null;
    maxMonthlySpendCents: number | null;
    suspended: boolean; note: string | null;
  };
  usage: {
    vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number;
    isos: number; isoGb: number; containers: number; containerMemMb: number; containerCpus: number;
  };
};

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const bound = (value: number | null) => (value === null ? '∞' : String(value));
