/** Shapes for the instances list page. */

export type Inst = {
  id: string; name: string; status: string; imageId: string; planId: string;
  ip: string; createdAt: number; activeJob: { type: string; status: string } | null;
  autoSuspended: number; rateHourlyCents: number;
  // Resolved server-side from the instance's plan, so a custom box (whose plan
  // is deliberately absent from the catalog) still shows its real specs.
  planName: string; vcpu: number; ramMb: number; diskGb: number; custom: number;
};
export type Plan = { id: string; name: string; vcpu: number; ramMb: number; diskGb: number; hourlyRateCents: number };
export type Img = { id: string; name: string; status: string };
export type Sample = { t: number; cpu: number; read: number; write: number };
