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
import { ifaceTraffic } from './sampler';

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

export async function listIfaces(libvirtBridges: Set<string>): Promise<Iface[]> {
  const [addrs, links, conns, traffic] = await Promise.all([
    run('ip', ['-j', 'addr', 'show']).then((s) => JSON.parse(s) as IpAddr[]),
    run('ip', ['-j', 'link', 'show']).then((s) => JSON.parse(s) as IpLink[]),
    nmConnections(),
    Promise.resolve(ifaceTraffic()),
  ]);
  const linkBy = new Map(links.map((l) => [l.ifname, l]));

  return addrs.map((a) => {
    const link = linkBy.get(a.ifname);
    const conn = conns[a.ifname] ?? null;
    // link_type is ARPHRD_ETHER ('ether') for bridges and bonds too, so it is
    // useless for classification. info_kind is the real one; fall back to name.
    const infoKind = link?.linkinfo?.info_kind;
    const kindHint = infoKind ?? '';
    const named = KIND.find(([re]) => re.test(a.ifname))?.[1];
    const isLibvirt = libvirtBridges.has(a.ifname) || a.ifname.startsWith('virbr');
    const isContainer = /^br-|^docker|^veth|^pterodactyl/.test(a.ifname) || kindHint === 'veth';
    const driver: Driver = isLibvirt ? 'libvirt' : isContainer ? 'container' : conn ? 'networkmanager' : 'unmanaged';

    const addresses: string[] = [];
    for (const ai of a.addr_info ?? []) {
      if (!ai.local) continue;
      addresses.push(ai.family === 'inet' ? `${ai.local}/${ai.prefixlen}` : `${ai.local}/${ai.prefixlen}`);
    }
    const t = traffic[a.ifname];
    return {
      name: a.ifname,
      kind: named ?? (kindHint || (link?.master ? 'port' : 'ethernet')),
      driver,
      connection: conn,
      state: a.operstate,
      mac: a.address ?? '',
      mtu: a.mtu,
      addresses,
      master: link?.master ?? null,
      speedMbps: sysRead(a.ifname, 'speed') || null,
      rxBytes: sysRead(a.ifname, 'statistics/rx_bytes'),
      txBytes: sysRead(a.ifname, 'statistics/tx_bytes'),
      rxBps: t?.rxBps ?? 0,
      txBps: t?.txBps ?? 0,
      series: t?.series ?? [],
    };
  }).sort((x, y) => (x.driver === 'unmanaged' ? 1 : 0) - (y.driver === 'unmanaged' ? 1 : 0) || x.name.localeCompare(y.name));
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

/**
 * Create an interface as a persistent NetworkManager connection and bring it up.
 * Deliberately narrow: only NEW devices, never an edit of an existing connection
 * (that is how you lock yourself out of a box over SSH). Port enslavement is
 * limited to interfaces that are down or unmanaged, and the primary uplink is
 * refused by name.
 */
export async function addIface(a: AddIface): Promise<{ name: string; detail: string }> {
  if (!SAFE_NAME.test(a.name)) throw new Error('name: 2-15 chars of letters, digits, . _ -');
  const exists = fs.existsSync(`/sys/class/net/${a.name}`);
  if (exists) throw new Error(`${a.name} already exists on the host`);

  const ports = (a.ports ?? []).filter(Boolean);
  for (const p of ports) {
    if (!fs.existsSync(`/sys/class/net/${p}`)) throw new Error(`port ${p} does not exist`);
    if (/^(enp|eno|eth)/.test(p)) {
      const hasAddr = (await run('ip', ['-j', 'addr', 'show', 'dev', p]).then((s) => (JSON.parse(s) as IpAddr[])[0]?.addr_info ?? [])) as unknown[];
      if (hasAddr.length > 0) throw new Error(`port ${p} carries an IP address — refusing to enslave an active uplink`);
    }
  }

  const addr = a.address?.trim() ?? '';
  if (addr && !/^[0-9a-fA-F:.]+\/\d{1,3}$/.test(addr)) throw new Error('address must be CIDR, e.g. 10.9.0.1/24');
  const ipArgs = addr
    ? ['ipv4.method', 'manual', 'ipv4.addresses', addr, 'ipv6.method', 'disabled']
    : ['ipv4.method', 'disabled', 'ipv6.method', 'disabled'];

  const con = a.name;
  const up = async (): Promise<string> => {
    await run('nmcli', ['connection', 'up', con], { sudo: true });
    const state = await run('nmcli', ['-t', '-f', 'GENERAL.STATE', 'device', 'show', a.name]).catch(() => '');
    return /^100/.test(state.trim()) ? 'up' : `created, state ${state.trim() || 'unknown'}`;
  };

  switch (a.kind) {
    case 'bridge':
      await run('nmcli', ['connection', 'add', 'type', 'bridge', 'con-name', con, 'ifname', a.name,
        'bridge.stp', 'no', ...ipArgs], { sudo: true });
      for (const p of ports) {
        await run('nmcli', ['connection', 'add', 'type', 'ethernet', 'con-name', `${con}-port-${p}`,
          'ifname', p, 'master', con, 'slave-type', 'bridge'], { sudo: true });
      }
      break;
    case 'vlan': {
      if (!a.parent) throw new Error('parent device required');
      if (!a.vlanId || a.vlanId < 1 || a.vlanId > 4094) throw new Error('vlan id must be 1-4094');
      await run('nmcli', ['connection', 'add', 'type', 'vlan', 'con-name', con, 'ifname', a.name,
        'dev', a.parent, 'id', String(a.vlanId), ...ipArgs], { sudo: true });
      break;
    }
    case 'bond':
      await run('nmcli', ['connection', 'add', 'type', 'bond', 'con-name', con, 'ifname', a.name,
        'bond.options', `mode=${a.bondMode || 'active-backup'},miimon=100`, ...ipArgs], { sudo: true });
      for (const p of ports) {
        await run('nmcli', ['connection', 'add', 'type', 'ethernet', 'con-name', `${con}-port-${p}`,
          'ifname', p, 'master', con, 'slave-type', 'bond'], { sudo: true });
      }
      break;
    case 'team':
      if (!(await has('teamd'))) throw new Error('teamd is not installed on the host, so NetworkManager cannot create a team. Use a bond instead.');
      await run('nmcli', ['connection', 'add', 'type', 'team', 'con-name', con, 'ifname', a.name,
        'team.config', '{"runner":{"name":"activebackup"}}', ...ipArgs], { sudo: true });
      for (const p of ports) {
        await run('nmcli', ['connection', 'add', 'type', 'ethernet', 'con-name', `${con}-port-${p}`,
          'ifname', p, 'master', con, 'slave-type', 'team'], { sudo: true });
      }
      break;
    case 'vpn': {
      // WireGuard: the one VPN NetworkManager can provision without a server
      // config to import. A peer is optional — an interface with only a private
      // key is a valid listening end for a site-to-site you configure later.
      const key = (await run('openssl', ['rand', '-base64', '32'])).trim();
      await run('nmcli', ['connection', 'add', 'type', 'wireguard', 'con-name', con, 'ifname', a.name,
        'wireguard.private-key', key, 'wireguard.listen-port', String(a.listenPort ?? 51820), ...ipArgs], { sudo: true });
      if (a.peerPublicKey && a.peerEndpoint && a.peerAllowedIps) {
        await run('nmcli', ['connection', 'modify', con,
          'wireguard-peer.' + a.peerPublicKey + '.endpoint', a.peerEndpoint,
          'wireguard-peer.' + a.peerPublicKey + '.allowed-ips', a.peerAllowedIps], { sudo: true });
      }
      break;
    }
  }

  const detail = await up().catch((e) => `created, but did not come up: ${(e as Error).message}`);
  return { name: a.name, detail };
}

/** Delete a NetworkManager connection we plausibly own. Refuses anything else. */
export async function deleteIface(name: string): Promise<void> {
  if (!SAFE_NAME.test(name)) throw new Error('bad interface name');
  const txt = await run('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show']).catch(() => '');
  const row = txt.split('\n').map((l) => l.split(':')).find(([n]) => n === name);
  if (!row) throw new Error(`${name} is not a NetworkManager connection — only those can be removed here`);
  const type = row[1] ?? '';
  if (!/bridge|vlan|bond|team|wireguard/.test(type)) {
    throw new Error(`${name} is a ${type} connection; refusing to delete it from here`);
  }
  await run('nmcli', ['connection', 'down', name], { sudo: true }).catch(() => {});
  await run('nmcli', ['connection', 'delete', name], { sudo: true });
}
