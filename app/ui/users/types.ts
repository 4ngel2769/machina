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

export type Allocation = {
  userId: string;
  quota: {
    maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null;
    maxDiskGb: number | null; maxRunning: number | null; suspended: boolean;
  };
  usage: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number };
};

export const money = (c: number) => `$${(c / 100).toFixed(2)}`;
export const bound = (v: number | null) => (v === null ? '∞' : String(v));
