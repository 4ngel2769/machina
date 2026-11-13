/** Shapes for the admin console page. */

export type User = {
  id: string; name: string; role: string; balanceCents: number; createdAt: number;
  imagePickable: number; assignedImageId: string | null;
  instanceCount: number; keyCount: number;
};
export type Plan = { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number; monthlyCapMin: number; bandwidthGb: number; custom: number };
export type Img = { id: string; name: string; status: string; failure: string | null; sha256: string; sizeBytes: number; updatedAt: number };
export type Aud = { id: string; ts: number; actorName: string | null; action: string; target: string | null; detail: string | null };
export type InstReq = { id: string; userId: string; name: string; planId: string; imageId: string | null; status: string; note: string | null; createdAt: number; reviewNote: string | null };
export type DelReq = { id: string; userId: string; status: string; requestedAt: number };
export type Quotas = {
  rows: {
    userId: string; name: string; role: string;
    quota: {
      maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null; maxDiskGb: number | null; maxRunning: number | null;
      maxIsoCount: number | null; maxIsoTotalGb: number | null;
      maxContainers: number | null; maxContainerMemMb: number | null; maxContainerCpus: number | null;
      suspended: boolean; note: string | null;
    };
    usage: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number; isos: number; isoGb: number; containers: number; containerMemMb: number; containerCpus: number };
    balanceCents: number;
  }[];
  host: { committed: { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number }; capacity: { memoryMb: number; vcpus: number; ramOvercommit: number } };
} | null;
