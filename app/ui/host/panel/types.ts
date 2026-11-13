/** Shapes the host console renders. Mirrors what /api/host returns. */

export type Owner = { id: string; name: string } | null;

export type Vm = {
  name: string; state: string; persistent: boolean; autostart: boolean;
  vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number;
  instanceId: string | null; owner: Owner; system: boolean;
};

export type NetHost = { mac: string; ip: string; name?: string };
export type NetIp = { family: 'ipv4' | 'ipv6'; address: string; prefix: number; dhcp: { start: string; end: string } | null; hosts: NetHost[] };
export type Net = { name: string; active: boolean; autostart: boolean; persistent: boolean; forward: string; bridge: string | null; domain: string | null; ips: NetIp[] };

export type Pool = {
  name: string; type: string; state: 'running' | 'stopped'; autostart: boolean; persistent: boolean;
  path: string; capacityMb: number | null; allocationMb: number | null; availableMb: number | null;
};

export type Iface = {
  name: string; kind: string; driver: 'networkmanager' | 'libvirt' | 'container' | 'unmanaged';
  connection: string | null; state: string; mac: string; mtu: number; addresses: string[];
  master: string | null; speedMbps: number | null; rxBytes: number; txBytes: number; rxBps: number; txBps: number;
  series: { t: number; rx: number; tx: number }[];
};

export type InstRow = {
  domain_name: string; id: string; plan_id: string; mac: string; ip: string;
  uid: string | null; uname: string | null; urole: string | null; balance_cents: number;
};

export type Inv = {
  vms: Vm[]; vmsError: string | null; networks: Net[]; networksError: string | null;
  interfaces: Iface[];
  pools: Pool[];
  instances: InstRow[];
  users: { id: string; name: string; role: string; balance_cents: number }[];
  host: { hostname: string; cpus: number; load: number[]; memTotalMb: number; memFreeMb: number; uptimeSec: number; release: string };
};

export type LogPayload = {
  rows: { id: string; ts: number; actor_name: string; action: string; target: string; detail: string }[];
};

/** Stand-in while the first poll is in flight, so the tabs never branch on null. */
export const EMPTY_INV: Inv = {
  vms: [], vmsError: null, networks: [], networksError: null,
  interfaces: [], pools: [], instances: [], users: [],
  host: { hostname: '', cpus: 0, load: [0], memTotalMb: 0, memFreeMb: 0, uptimeSec: 0, release: '' },
};

export const TABS = ['machines', 'networks', 'interfaces', 'pools', 'users', 'log'] as const;
export type Tab = (typeof TABS)[number];

/** POST to a host endpoint, toast the outcome, and report success. */
export type Post = (url: string, body: Record<string, unknown>, label: string) => Promise<boolean>;
export type NetPost = (body: Record<string, unknown>, label: string) => Promise<boolean>;
export type VmPost = (name: string, body: Record<string, unknown>, label: string) => Promise<boolean>;
