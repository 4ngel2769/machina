/**
 * Shapes shared by the host VM console: what a domain looks like in the list,
 * what it looks like on its own page, and the edits an admin may apply.
 */

export type VmOwner = { id: string; name: string } | null;

export type VmDisk = {
  target: string; bus: string; device: string; source: string; format: string; sizeGb: number | null;
};
export type VmNic = { mac: string; type: string; source: string; model: string };
export type VmHostdev = { kind: string; label: string; xml: string };
export type VmDir = { source: string; target: string; readonly: boolean };
export type VmSummary = {
  name: string; uuid: string; state: string; persistent: boolean; autostart: boolean;
  vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number;
  instanceId: string | null; owner: VmOwner; system: boolean;
};
export type VmDetail = VmSummary & {
  arch: string; machineType: string; osType: string; cpuMode: string; cpuModel: string;
  sockets: number; cores: number; threads: number;
  boot: string[]; firmware: 'bios' | 'efi';
  disks: VmDisk[]; nics: VmNic[]; hostdevs: VmHostdev[]; dirs: VmDir[];
  watchdog: { model: string; action: string } | null;
  vnc: string | null;
  spice: { port: number; tlsPort: number | null } | null;
};

export type VmOp =
  | { op: 'power'; action: 'start' | 'shutdown' | 'reboot' | 'destroy' | 'reset' | 'pause' | 'resume' }
  | { op: 'autostart'; on: boolean }
  | { op: 'vcpu'; count: number; max?: number }
  | { op: 'memory'; mb: number }
  | { op: 'topology'; sockets: number; cores: number; threads: number }
  | { op: 'cpuMode'; mode: string }
  | { op: 'boot'; order: string[] }
  | { op: 'watchdog'; action: 'reset' | 'poweroff' | 'inject-nmi' | 'pause' | 'none' }
  | { op: 'diskAttach'; sizeGb: number; bus?: string }
  | { op: 'diskDetach'; target: string }
  | { op: 'nicAttach'; network: string; model?: string }
  | { op: 'nicDetach'; mac: string }
  | { op: 'hostdevAttach'; vendor: string; product: string }
  | { op: 'hostdevDetach'; index: number }
  | { op: 'dirAttach'; source: string; tag: string }
  | { op: 'dirDetach'; tag: string }
  | { op: 'isoAttach'; iso: string }
  | { op: 'isoDetach'; target: string }
  | { op: 'spice'; on: boolean };
