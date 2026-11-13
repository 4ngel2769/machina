/**
 * libvirt virtual networks.
 *
 * Everything here is config-first: a change is written with `net-define` and
 * takes effect at the next start of that network. There is no implicit
 * net-destroy anywhere — bouncing a NAT network drops DHCP for every guest on
 * it, so that is a separate, explicit action. The one exception is adding or
 * removing a static DHCP reservation, which `net-update` applies in place.
 */

import { virsh } from '@/lib/core/driver';
import { config, storagePaths } from '@/lib/config';
import { rawDb } from '@/lib/db';
import fs from 'fs/promises';
import path from 'path';
import { ignore } from '@/lib/core/ignore';

export type NetHost = { mac: string; ip: string; name?: string };
export type NetIp = {
  family: 'ipv4' | 'ipv6';
  address: string;
  prefix: number;
  dhcp: { start: string; end: string } | null;
  hosts: NetHost[];
};
export type Net = {
  name: string;
  active: boolean;
  autostart: boolean;
  persistent: boolean;
  forward: string;
  bridge: string | null;
  domain: string | null;
  ips: NetIp[];
};

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,40}$/;

export function validateNetName(name: string): string {
  if (!NAME_RE.test(name)) throw new Error('network name: 2-41 chars of letters, digits, . _ -');
  return name;
}

function prefixFromNetmask(mask: string): number | null {
  const octets = mask.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  let bits = 0;
  for (const octet of octets) bits += (octet >>> 0).toString(2).split('1').length - 1;
  return bits;
}

/** Static DHCP reservations inside one <ip> block. */
function parseHosts(body: string): NetHost[] {
  const hosts: NetHost[] = [];
  const hre = /<host\b([^>]*)\/?>/g;
  let hostMatch: RegExpExecArray | null;
  while ((hostMatch = hre.exec(body))) {
    const attrs = hostMatch[1];
    const mac = /mac='([^']*)'/.exec(attrs)?.[1];
    const ip = /ip='([^']*)'/.exec(attrs)?.[1];
    if (mac && ip) hosts.push({ mac, ip, name: /name='([^']*)'/.exec(attrs)?.[1] });
  }
  return hosts;
}

/** Prefix from prefix='' or netmask=''; both may be absent (libvirt omits the
 *  default), which is why the caller's fallback exists. */
function parsePrefix(attrs: string, family: 'ipv4' | 'ipv6'): number {
  const explicit = /prefix='(\d+)'/.exec(attrs)?.[1];
  const netmask = /netmask='([^']*)'/.exec(attrs)?.[1] ?? '';
  const prefix = Number(explicit ?? (prefixFromNetmask(netmask) ?? ''));
  if (Number.isFinite(prefix)) return prefix;
  return family === 'ipv6' ? 64 : 24;
}

/** One <ip> element, or null when it carries no address. */
function parseIp(attrs: string, body: string): NetIp | null {
  const address = /address='([^']*)'/.exec(attrs)?.[1];
  if (!address) return null;
  const family = /family='ipv6'/.test(attrs) ? 'ipv6' : 'ipv4';
  const range = body.match(/<range\b[^>]*start='([^']*)'[^>]*end='([^']*)'/);
  return {
    family,
    address,
    prefix: parsePrefix(attrs, family),
    dhcp: range ? { start: range[1]!, end: range[2]! } : null,
    hosts: parseHosts(body),
  };
}

/** <forward mode='x'>; a bare <forward> means NAT. */
function forwardOf(xml: string): string {
  const fwd = xml.match(/<forward\b([^>]*)/)?.[1] ?? '';
  return /mode='([^']*)'/.exec(fwd)?.[1] ?? (fwd ? 'nat' : 'isolated');
}

/** name='' attribute of the first matching element. */
function namedElement(xml: string, tag: string): string | null {
  return xml.match(new RegExp(`<${tag}\\b[^>]*name='([^']*)'`))?.[1] ?? null;
}

function parseNet(name: string, xml: string, meta: { active: boolean; autostart: boolean; persistent: boolean }): Net {
  const ips: NetIp[] = [];
  // Both <ip ...>...</ip> and self-closed <ip .../> must be handled; a network
  // with an address and no DHCP is normal (route/bridge mode without dnsmasq).
  const re = /<ip\b([^>]*?)(\/>|>([\s\S]*?)<\/ip>)/g;
  let ipMatch: RegExpExecArray | null;
  while ((ipMatch = re.exec(xml))) {
    const ip = parseIp(ipMatch[1], ipMatch[3] ?? '');
    if (ip) ips.push(ip);
  }
  return {
    name, ...meta,
    forward: forwardOf(xml),
    bridge: namedElement(xml, 'bridge'),
    domain: namedElement(xml, 'domain'),
    ips,
  };
}

export async function listNetworks(): Promise<Net[]> {
  const out = await virsh(['net-list', '--all']);
  const rows = out.split('\n').slice(2).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));
  const nets: Net[] = [];
  for (const cells of rows) {
    if (cells.length < 2) continue;
    const [name, state, autostart, persistent] = cells;
    const meta = {
      // "inactive" contains "active", so a substring test marks every stopped
      // network as running — which then makes delete try to destroy an already
      // dead network and fail. Compare the whole word.
      active: (state ?? '').trim().toLowerCase() === 'active',
      autostart: /yes/i.test(autostart ?? ''),
      persistent: /yes/i.test(persistent ?? ''),
    };
    let xml = '';
    try {
      xml = await virsh(['net-dumpxml', '--inactive', name]);
    } catch {
      try { xml = await virsh(['net-dumpxml', name]); } catch { continue; }
    }
    nets.push(parseNet(name, xml, meta));
  }
  return nets;
}

export function bridges(nets: Net[]): Set<string> {
  return new Set(nets.map((net) => net.bridge).filter((bridge): bridge is string => Boolean(bridge)));
}

function ipBlock(ip: NetIp): string {
  const fam = ip.family === 'ipv6' ? " family='ipv6'" : '';
  const hosts = ip.hosts.map((host) => `    <host mac='${host.mac}'${host.name ? ` name='${host.name}'` : ''} ip='${host.ip}'/>`).join('\n');
  const room = ip.dhcp || hosts;
  if (!room) return `  <ip${fam} address='${ip.address}' prefix='${ip.prefix}'/>`;
  return `  <ip${fam} address='${ip.address}' prefix='${ip.prefix}'>
${ip.dhcp ? `    <dhcp>\n      <range start='${ip.dhcp.start}' end='${ip.dhcp.end}'/>${hosts ? `\n${hosts}` : ''}\n    </dhcp>` : hosts}
  </ip>`;
}

export type NetInput = {
  name: string;
  forward: 'nat' | 'route' | 'bridge' | 'isolated' | 'open';
  bridge?: string | null;
  domain?: string | null;
  ipv4?: NetIp | null;
  ipv6?: NetIp | null;
};

export function buildNetXml(netInput: NetInput): string {
  const parts: string[] = [`<network>`, `  <name>${netInput.name}</name>`];
  if (netInput.forward !== 'isolated') parts.push(`  <forward mode='${netInput.forward}'/>`);
  if (netInput.bridge) parts.push(`  <bridge name='${netInput.bridge}' stp='on' delay='0'/>`);
  if (netInput.ipv4) parts.push(ipBlock(netInput.ipv4));
  if (netInput.ipv6) parts.push(ipBlock(netInput.ipv6));
  if (netInput.domain) parts.push(`  <domain name='${netInput.domain}' localOnly='yes'/>`);
  parts.push('</network>');
  return parts.join('\n') + '\n';
}

async function defineXml(xml: string): Promise<void> {
  const tempFile = path.join(storagePaths().tmp, `net-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xml`);
  await fs.mkdir(path.dirname(tempFile), { recursive: true });
  await fs.writeFile(tempFile, xml, 'utf8');
  try {
    await virsh(['net-define', tempFile]);
  } finally {
    await fs.rm(tempFile, { force: true }).catch(ignore('temp file may not exist'));
  }
}

export async function createNetwork(netInput: NetInput): Promise<Net> {
  validateNetName(netInput.name);
  const existing = await listNetworks().catch(() => []);
  if (existing.some((net) => net.name === netInput.name)) throw new Error(`a network named ${netInput.name} already exists`);
  await defineXml(buildNetXml(netInput));
  await virsh(['net-start', netInput.name]);
  await virsh(['net-autostart', netInput.name]);
  return (await listNetworks()).find((net) => net.name === netInput.name)!;
}

export async function setAutostart(name: string, on: boolean): Promise<void> {
  await virsh(['net-autostart', ...(on ? [] : ['--disable']), name]);
}

export async function startStop(name: string, up: boolean): Promise<void> {
  await virsh([up ? 'net-start' : 'net-destroy', name]);
}

export async function deleteNetwork(name: string): Promise<void> {
  const net = (await listNetworks()).find((candidate) => candidate.name === name);
  if (!net) throw new Error('network not found');
  if (name === 'default' || name === 'machina0') throw new Error('refusing to delete a network machina depends on');
  // A per-user net with live instances is load-bearing: deleting it strands
  // every VM on it. Empty user nets are safe to remove — ensureUserNet
  // recreates one lazily on the next provision.
  const inUse = rawDb().prepare(`select 1 from instances where net_name=? limit 1`).get(name);
  if (inUse) throw new Error(`network ${name} still has instances attached`);
  if (net.active) await virsh(['net-destroy', name]);
  await virsh(['net-undefine', name]);
  rawDb().prepare(`delete from user_nets where name=?`).run(name);
}

/** Live DHCP reservation. net-update applies without restarting the network. */
export async function setDhcpHost(
  netName: string, host: NetHost, action: 'add' | 'remove',
): Promise<void> {
  const net = (await listNetworks()).find((candidate) => candidate.name === netName);
  if (!net) throw new Error('network not found');
  if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(host.mac)) throw new Error('mac must be aa:bb:cc:dd:ee:ff');
  const xml = `<host mac='${host.mac}'${host.name ? ` name='${host.name}'` : ''} ip='${host.ip}'/>`;
  const flags = net.active ? ['--live', '--config'] : ['--config'];
  try {
    // virsh spells the two verbs add | delete, not add | remove.
    await virsh(['net-update', netName, action === 'remove' ? 'delete' : 'add', 'ip-dhcp-host', xml, ...flags]);
  } catch (e) {
    const msg = (e as Error).message;
    throw new Error(/range|dhcp/i.test(msg) ? `${msg} (a static reservation needs an ipv4 DHCP range on that network)` : msg);
  }
}

/** Explicit DHCP setting wins; undefined means "keep what the network has". */
function dhcpOf(ipPatch: Partial<NetIp>, current: NetIp | undefined): NetIp['dhcp'] {
  if (ipPatch.dhcp !== undefined) return ipPatch.dhcp;
  return current?.dhcp ?? null;
}

/** One family's <ip> block, merged over whatever the network already has. */
function mergeIp(net: Net, family: 'ipv4' | 'ipv6', ipPatch: Partial<NetIp>): NetIp {
  const current = net.ips.find((ip) => ip.family === family);
  const prefixFallback = family === 'ipv6' ? 64 : 24;
  return {
    family,
    address: ipPatch.address ?? current?.address ?? '',
    prefix: ipPatch.prefix ?? current?.prefix ?? prefixFallback,
    dhcp: dhcpOf(ipPatch, current),
    hosts: current?.hosts ?? [],
  };
}

/** Rewrite (or append) the one family's block, keeping everything we do not model. */
function applyIpPatch(
  next: string, meta: { name: string; xml: string }, family: 'ipv4' | 'ipv6', ipPatch: Partial<NetIp>,
): string {
  const block = new RegExp(`<ip\\b[^>]*${family === 'ipv6' ? "family='ipv6'" : "(?<!family='ipv6')"}[^>]*?(\\/>|>[\\s\\S]*?<\\/ip>)`);
  const merged = mergeIp(parseNet(meta.name, meta.xml, { active: false, autostart: false, persistent: true }), family, ipPatch);
  if (!merged.address) return next;
  if (block.test(next)) return next.replace(block, ipBlock(merged).trim());
  return next.replace('</network>', `${ipBlock(merged)}\n</network>`);
}

function applyDomain(next: string, domain: string | null): string {
  if (/<domain\b[^>]*\/>/.test(next)) {
    return next.replace(/<domain\b[^>]*\/>/, domain ? `<domain name='${domain}' localOnly='yes'/>` : '');
  }
  if (!domain) return next;
  return next.replace('</network>', `  <domain name='${domain}' localOnly='yes'/>\n</network>`);
}

/** keep the previous XML: a bad net-define can leave a network unstartable */
async function backupAndDefine(name: string, xml: string, next: string): Promise<void> {
  const dir = path.join(storagePaths().root, 'xml-backups');
  await fs.mkdir(dir, { recursive: true }).catch(ignore('dir may already exist'));
  await fs.writeFile(path.join(dir, `net-${name}-${Date.now()}.xml`), xml, 'utf8').catch(ignore('backup copy is best-effort'));
  await defineXml(next);
}

/**
 * Update the address/prefix/DHCP range of one family, or autostart. Editing the
 * XML in place keeps anything we do not model (dns entries, custom options)
 * intact, which a rebuild-from-scratch would silently drop.
 */
export async function updateNetwork(name: string, patch: {
  ipv4?: Partial<NetIp> | null;
  ipv6?: Partial<NetIp> | null;
  domain?: string | null;
  autostart?: boolean;
}): Promise<void> {
  if (patch.autostart !== undefined) await setAutostart(name, patch.autostart);
  if (patch.ipv4 === undefined && patch.ipv6 === undefined && patch.domain === undefined) return;

  const xml = await virsh(['net-dumpxml', '--inactive', name]);
  let next = xml;

  for (const family of ['ipv4', 'ipv6'] as const) {
    const ipPatch = patch[family];
    if (!ipPatch) continue;
    next = applyIpPatch(next, { name, xml }, family, ipPatch);
  }

  if (patch.domain !== undefined) next = applyDomain(next, patch.domain);
  if (next !== xml) await backupAndDefine(name, xml, next);
}

/** Whether this connection is the one machina itself uses for guests. */
export function isMachinaNet(name: string): boolean {
  return name === config.network || name === 'default';
}
