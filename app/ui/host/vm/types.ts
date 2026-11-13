/** Shapes the single-VM host page renders. Mirrors /api/host/vm. */

export type Detail = {
  name: string; state: string; persistent: boolean; autostart: boolean;
  vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number;
  instanceId: string | null; owner: { id: string; name: string } | null; system: boolean;
  arch: string; machineType: string; osType: string; cpuMode: string; cpuModel: string;
  sockets: number; cores: number; threads: number; boot: string[];
  firmware: 'bios' | 'efi'; vnc: string | null;
  spice: { port: number; tlsPort: number | null } | null;
  watchdog: { model: string; action: string } | null;
  disks: { target: string; bus: string; device: string; source: string; format: string; sizeGb: number | null }[];
  nics: { mac: string; type: string; source: string; model: string }[];
  hostdevs: { kind: string; label: string; xml: string }[];
  dirs: { source: string; target: string; readonly: boolean }[];
};

export type Live = {
  cpuSec: number; memMb: number; maxMemMb: number;
  nets: { name: string; rxBytes: number; txBytes: number }[];
  blocks: { name: string; rdBytes: number; wrBytes: number }[];
};

export type Snap = {
  name: string; description: string; state: string; isCurrent: boolean;
  sizeBytes: number; createdAt: number;
};

export type Payload = { vm: Detail; live: Live; snapshots: Snap[]; dominfo: string };

export type NetList = { networks: { name: string; active: boolean }[] };
export type Iso = { name: string; sizeMb: number; sha256: string | null };
export type IsoList = { isos: Iso[]; maxIsoGb: number };

/** A host action: POST it, toast the outcome, and report success. */
export type Op = (body: Record<string, unknown>, label: string) => Promise<boolean>;
