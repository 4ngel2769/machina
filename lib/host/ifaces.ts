/**
 * Host interface inventory and creation.
 *
 * "Managed" here means something on this host owns the interface: NetworkManager
 * has a connection for it, libvirt manages its bridge, or a container runtime
 * created it. Everything else is unmanaged — an interface exists at the kernel
 * and nothing will put it back after a reboot. That distinction is the one that
 * matters when you are deciding what is safe to touch, so it is a column rather
 * than a second page.
 */

import fs from 'fs';
import { run, has } from './exec';
import { ifaceTraffic, type IfaceTraffic } from './sampler';

export type Driver = 'networkmanager' | 'libvirt' | 'container' | 'unmanaged';

export type Iface = {
  name: string;
  kind: string;
  driver: Driver;
  connection: string | null;
  state: string;
  mac: string;
  mtu: number;
  addresses: string[];
  master: string | null;
  speedMbps: number | null;
  rxBytes: number;
  txBytes: number;
  rxBps: number;
  txBps: number;
  series: { t: number; rx: number; tx: number }[];
};

type IpAddr = {
  ifname: string; ifindex: number; operstate: string; mtu: number; address?: string;
  link_type?: string; flags?: string[];
  addr_info?: { family: string; local: string; prefixlen: number; scope?: string; address?: string }[];
  link_index?: number;
};
type IpLink = { ifname: string; master?: string; linkinfo?: { info_kind?: string }; link_type?: string };

const KIND: [RegExp, string][] = [
  [/^lo$/, 'loopback'],
  [/^veth/, 'veth'],
  [/^virbr/, 'libvirt bridge'],
  [/^br-/, 'container bridge'],
  [/^docker|^pterodactyl/, 'container bridge'],
  [/^br/, 'bridge'],
  [/^bond/, 'bond'],
  [/^team/, 'team'],
  [/^wg/, 'wireguard'],
  [/^tun|^tap/, 'tun/tap'],
  [/\.\d+$/, 'vlan'],
];

function sysRead(ifname: string, file: string): number {
  try { return Number(fs.readFileSync(`/sys/class/net/${ifname}/${file}`, 'utf8').trim()); } catch { return 0; }
}

/** NetworkManager connection per device, or null when NM does not own it. */
async function nmConnections(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    // DEVICE:CONNECTION is enough; "connected (externally)" has an empty
    // connection id, which is exactly the unmanaged case we want to keep empty.
    const txt = await run('nmcli', ['-t', '-f', 'DEVICE,CONNECTION', 'device']);
    for (const line of txt.split('\n')) {
      const [dev, con] = line.split(':');
      if (dev && con) out[dev] = con;
    }
  } catch { /* NM absent: everything that is not libvirt/container is unmanaged */ }
  return out;
}

/** libvirt owns virbr* and whatever the caller named; a container runtime owns
 *  its own bridges and veths; NetworkManager owns what it has a connection for. */
function driverOf(
  name: string, link: IpLink | undefined, conn: string | null, libvirtBridges: Set<string>,
): Driver {
  if (libvirtBridges.has(name) || name.startsWith('virbr')) return 'libvirt';
  if (/^br-|^docker|^veth|^pterodactyl/.test(name) || link?.linkinfo?.info_kind === 'veth') return 'container';
  if (conn) return 'networkmanager';
  return 'unmanaged';
}

/** link_type is ARPHRD_ETHER ('ether') for bridges and bonds too, so it is
 *  useless for classification. info_kind is the real one; fall back to name. */
function kindOf(name: string, link: IpLink | undefined): string {
  const named = KIND.find(([re]) => re.test(name))?.[1];
  if (named) return named;
  const infoKind = link?.linkinfo?.info_kind;
  if (infoKind) return infoKind;
  return link?.master ? 'port' : 'ethernet';
}

function addressesOf(a: IpAddr): string[] {
  const out: string[] = [];
  for (const ai of a.addr_info ?? []) {
    if (ai.local) out.push(`${ai.local}/${ai.prefixlen}`);
  }
  return out;
}

/** Kernel counters for one device. */
function ioFields(name: string): Pick<Iface, 'speedMbps' | 'rxBytes' | 'txBytes'> {
  return {
    speedMbps: sysRead(name, 'speed') || null,
    rxBytes: sysRead(name, 'statistics/rx_bytes'),
    txBytes: sysRead(name, 'statistics/tx_bytes'),
  };
}

function trafficFields(traffic: IfaceTraffic | undefined): Pick<Iface, 'rxBps' | 'txBps' | 'series'> {
  return { rxBps: traffic?.rxBps ?? 0, txBps: traffic?.txBps ?? 0, series: traffic?.series ?? [] };
}

function toIface(
  a: IpAddr,
  link: IpLink | undefined,
  conn: string | null,
  traffic: Record<string, IfaceTraffic>,
  libvirtBridges: Set<string>,
): Iface {
  return {
    name: a.ifname,
    kind: kindOf(a.ifname, link),
    driver: driverOf(a.ifname, link, conn, libvirtBridges),
    connection: conn,
    state: a.operstate,
    mac: a.address ?? '',
    mtu: a.mtu,
    addresses: addressesOf(a),
    master: link?.master ?? null,
    ...ioFields(a.ifname),
    ...trafficFields(traffic[a.ifname]),
  };
}

export async function listIfaces(libvirtBridges: Set<string>): Promise<Iface[]> {
  const [addrs, links, conns, traffic] = await Promise.all([
    run('ip', ['-j', 'addr', 'show']).then((stdout) => JSON.parse(stdout) as IpAddr[]),
    run('ip', ['-j', 'link', 'show']).then((stdout) => JSON.parse(stdout) as IpLink[]),
    nmConnections(),
    Promise.resolve(ifaceTraffic()),
  ]);
  const linkBy = new Map(links.map((link) => [link.ifname, link]));

  return addrs
    .map((addr) => toIface(addr, linkBy.get(addr.ifname), conns[addr.ifname] ?? null, traffic, libvirtBridges))
    .sort((left, right) => (left.driver === 'unmanaged' ? 1 : 0) - (right.driver === 'unmanaged' ? 1 : 0) || left.name.localeCompare(right.name));
}

export type AddIface = {
  kind: 'bridge' | 'vlan' | 'bond' | 'team' | 'vpn';
  name: string;
  /** physical ports to enslave (bridge/bond/team), comma list */
  ports?: string[];
  /** vlan parent device + id */
  parent?: string;
  vlanId?: number;
  bondMode?: string;
  /** optional static address in CIDR form, e.g. 10.9.0.1/24. None means no
   *  addressing at all, which is what a bridge/bond meant for VMs wants. */
  address?: string;
  /** wireguard */
  listenPort?: number;
  peerPublicKey?: string;
  peerEndpoint?: string;
  peerAllowedIps?: string;
};

const SAFE_NAME = /^[a-zA-Z0-9_.-]{2,15}$/;

/** Every port exists and is not the live uplink we are talking over. */
async function assertPortsFree(ports: string[]): Promise<void> {
  for (const port of ports) {
    if (!fs.existsSync(`/sys/class/net/${port}`)) throw new Error(`port ${port} does not exist`);
    if (!/^(enp|eno|eth)/.test(port)) continue;
    const hasAddr = (await run('ip', ['-j', 'addr', 'show', 'dev', port])
      .then((stdout) => (JSON.parse(stdout) as IpAddr[])[0]?.addr_info ?? [])) as unknown[];
    if (hasAddr.length > 0) throw new Error(`port ${port} carries an IP address — refusing to enslave an active uplink`);
  }
}

/** Static address in CIDR form, or none. Anything else is rejected. */
function addressArgs(address: string | undefined): string[] {
  const addr = address?.trim() ?? '';
  if (addr && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(addr)) throw new Error('address must be CIDR, e.g. 10.9.0.1/24');
  if (!addr) return ['ipv4.method', 'disabled', 'ipv6.method', 'disabled'];
  return ['ipv4.method', 'manual', 'ipv4.addresses', addr, 'ipv6.method', 'disabled'];
}

/** One ethernet connection enslaved to `master`. */
function enslave(connectionName: string, port: string, master: string, slaveType: string): Promise<string> {
  return run('nmcli', ['connection', 'add', 'type', 'ethernet', 'con-name', `${connectionName}-port-${port}`,
    'ifname', port, 'master', connectionName, 'slave-type', slaveType], { sudo: true });
}

async function addBridge(connectionName: string, name: string, ipArgs: string[], ports: string[]): Promise<void> {
  await run('nmcli', ['connection', 'add', 'type', 'bridge', 'con-name', connectionName, 'ifname', name,
    'bridge.stp', 'no', ...ipArgs], { sudo: true });
  for (const port of ports) await enslave(connectionName, port, connectionName, 'bridge');
}

async function addVlan(iface: AddIface, connectionName: string, ipArgs: string[]): Promise<void> {
  if (!iface.parent) throw new Error('parent device required');
  if (!iface.vlanId || iface.vlanId < 1 || iface.vlanId > 4094) throw new Error('vlan id must be 1-4094');
  await run('nmcli', ['connection', 'add', 'type', 'vlan', 'con-name', connectionName, 'ifname', iface.name,
    'dev', iface.parent, 'id', String(iface.vlanId), ...ipArgs], { sudo: true });
}

async function addBond(iface: AddIface, connectionName: string, ipArgs: string[], ports: string[]): Promise<void> {
  await run('nmcli', ['connection', 'add', 'type', 'bond', 'con-name', connectionName, 'ifname', iface.name,
    'bond.options', `mode=${iface.bondMode || 'active-backup'},miimon=100`, ...ipArgs], { sudo: true });
  for (const port of ports) await enslave(connectionName, port, connectionName, 'bond');
}

async function addTeam(iface: AddIface, connectionName: string, ipArgs: string[], ports: string[]): Promise<void> {
  if (!(await has('teamd'))) throw new Error('teamd is not installed on the host, so NetworkManager cannot create a team. Use a bond instead.');
  await run('nmcli', ['connection', 'add', 'type', 'team', 'con-name', connectionName, 'ifname', iface.name,
    'team.config', '{"runner":{"name":"activebackup"}}', ...ipArgs], { sudo: true });
  for (const port of ports) await enslave(connectionName, port, connectionName, 'team');
}

async function addVpn(iface: AddIface, connectionName: string, ipArgs: string[]): Promise<void> {
  // WireGuard: the one VPN NetworkManager can provision without a server config
  // to import. A peer is optional — an interface with only a private key is a
  // valid listening end for a site-to-site you configure later.
  const key = (await run('openssl', ['rand', '-base64', '32'])).trim();
  await run('nmcli', ['connection', 'add', 'type', 'wireguard', 'con-name', connectionName, 'ifname', iface.name,
    'wireguard.private-key', key, 'wireguard.listen-port', String(iface.listenPort ?? 51820), ...ipArgs], { sudo: true });
  if (!iface.peerPublicKey || !iface.peerEndpoint || !iface.peerAllowedIps) return;
  await run('nmcli', ['connection', 'modify', connectionName,
    'wireguard-peer.' + iface.peerPublicKey + '.endpoint', iface.peerEndpoint,
    'wireguard-peer.' + iface.peerPublicKey + '.allowed-ips', iface.peerAllowedIps], { sudo: true });
}

/** Bring the new connection up and report the state it settled in. */
async function bringUp(name: string): Promise<string> {
  await run('nmcli', ['connection', 'up', name], { sudo: true });
  const state = await run('nmcli', ['-t', '-f', 'GENERAL.STATE', 'device', 'show', name]).catch(() => '');
  return /^100/.test(state.trim()) ? 'up' : `created, state ${state.trim() || 'unknown'}`;
}

/**
 * Create an interface as a persistent NetworkManager connection and bring it up.
 * Deliberately narrow: only NEW devices, never an edit of an existing connection
 * (that is how you lock yourself out of a box over SSH). Port enslavement is
 * limited to interfaces that are down or unmanaged, and the primary uplink is
 * refused by name.
 */
export async function addIface(iface: AddIface): Promise<{ name: string; detail: string }> {
  if (!SAFE_NAME.test(iface.name)) throw new Error('name: 2-15 chars of letters, digits, . _ -');
  if (fs.existsSync(`/sys/class/net/${iface.name}`)) throw new Error(`${iface.name} already exists on the host`);

  const ports = (iface.ports ?? []).filter(Boolean);
  await assertPortsFree(ports);
  const ipArgs = addressArgs(iface.address);
  const connectionName = iface.name;

  switch (iface.kind) {
    case 'bridge': await addBridge(connectionName, iface.name, ipArgs, ports); break;
    case 'vlan': await addVlan(iface, connectionName, ipArgs); break;
    case 'bond': await addBond(iface, connectionName, ipArgs, ports); break;
    case 'team': await addTeam(iface, connectionName, ipArgs, ports); break;
    case 'vpn': await addVpn(iface, connectionName, ipArgs); break;
  }

  const detail = await bringUp(iface.name).catch((caught) => `created, but did not come up: ${(caught as Error).message}`);
  return { name: iface.name, detail };
}

/** Delete a NetworkManager connection we plausibly own. Refuses anything else. */
export async function deleteIface(name: string): Promise<void> {
  if (!SAFE_NAME.test(name)) throw new Error('bad interface name');
  const txt = await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show']).catch(() => '');
  const row = txt.split('\n').map((line) => line.split(':')).find(([deviceName]) => deviceName === name);
  if (!row) throw new Error(`${name} is not a NetworkManager connection — only those can be removed here`);
  const type = row[1] ?? '';
  if (!/bridge|vlan|bond|team|wireguard/.test(type)) {
    throw new Error(`${name} is a ${type} connection; refusing to delete it from here`);
  }
  await run('nmcli', ['connection', 'down', name], { sudo: true }).catch(() => {});
  await run('nmcli', ['connection', 'delete', name], { sudo: true });
}
