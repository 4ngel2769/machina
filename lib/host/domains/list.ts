/**
 * The host's domain list: libvirt's own table joined with machina's ownership
 * rows, plus per-domain vcpu/memory counters. One virsh call per concern, no
 * per-VM calls, because this backs a page that lists every domain on the host.
 */
import { virsh } from '@/lib/core/driver';
import { rawDb } from '@/lib/db';
import fs from 'fs/promises';
import type { VmOwner, VmSummary } from './types';

type StatsRow = { vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number };

/** Which domains machina created, and which account rented them. */
function ownerMap(): Map<string, { instanceId: string; owner: VmOwner }> {
  const rows = rawDb().prepare(
    `select i.id, i.domain_name, u.id uid, u.name uname
     from instances i left join users u on u.id = i.user_id`,
  ).all() as { id: string; domain_name: string; uid: string | null; uname: string | null }[];
  const byDomain = new Map<string, { instanceId: string; owner: VmOwner }>();
  for (const row of rows) byDomain.set(row.domain_name, {
    instanceId: row.id,
    owner: row.uid ? { id: row.uid, name: row.uname ?? row.uid } : null,
  });
  return byDomain;
}

function blankStats(): StatsRow {
  return { vcpu: 0, vcpuMax: 0, memMb: 0, memMaxMb: 0 };
}

function applyStatLine(target: StatsRow, line: string): void {
  const [key, value] = line.trim().split('=');
  if (key === 'vcpu.current') target.vcpu = Number(value);
  else if (key === 'vcpu.maximum') target.vcpuMax = Number(value);
  else if (key === 'balloon.current') target.memMb = Math.round(Number(value) / 1024);
  else if (key === 'balloon.maximum') target.memMaxMb = Math.round(Number(value) / 1024);
}

/** `domstats` blocks: a `Domain: 'name'` header then key=value lines. */
function parseDomStats(txt: string): Map<string, StatsRow> {
  const out = new Map<string, StatsRow>();
  let current: StatsRow | null = null;
  let domainName = '';
  for (const line of txt.split('\n')) {
    const head = /^Domain: '(.+)'$/.exec(line);
    if (head) {
      if (domainName && current) out.set(domainName, current);
      domainName = head[1];
      current = blankStats();
      continue;
    }
    if (current) applyStatLine(current, line);
  }
  if (domainName && current) out.set(domainName, current);
  return out;
}

/** vcpu/memory straight from libvirt, one call for the whole host. */
async function domStats(): Promise<Map<string, StatsRow>> {
  try {
    return parseDomStats(await virsh(['domstats', '--list-active', '--list-inactive', '--vcpu', '--balloon']));
  } catch {
    return new Map();
  }
}

/** Domains flagged to start with the host. */
async function autostartSet(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    for (const file of await fs.readdir('/etc/libvirt/qemu/autostart')) out.add(file.replace(/\.xml$/, ''));
  } catch { /* no autostart dir yet */ }
  return out;
}

/** Collapse libvirt's free-text state into the three the UI reasons about. */
function normState(state: string): string {
  if (/running/i.test(state)) return 'running';
  if (/paused/i.test(state)) return 'paused';
  if (/shut/i.test(state)) return 'stopped';
  return state;
}

/** Counters default to zero for a domain libvirt reported no stats for. */
function statsFields(stats: StatsRow | undefined) {
  return { vcpu: stats?.vcpu ?? 0, vcpuMax: stats?.vcpuMax ?? 0, memMb: stats?.memMb ?? 0, memMaxMb: stats?.memMaxMb ?? 0 };
}

/** Ownership: a domain with no instance row is the operator's own. */
function ownerFields(ownership: { instanceId: string; owner: VmOwner } | undefined) {
  return { instanceId: ownership?.instanceId ?? null, owner: ownership?.owner ?? null, system: !ownership };
}

function toSummary(
  parts: string[],
  stats: Map<string, StatsRow>,
  owners: Map<string, { instanceId: string; owner: VmOwner }>,
  autostart: Set<string>,
): VmSummary | null {
  if (parts.length < 2) return null;
  const name = parts[1];
  return {
    name,
    uuid: '',
    state: normState(parts.slice(2).join(' ')),
    persistent: parts[0] !== '-',
    autostart: autostart.has(name),
    ...statsFields(stats.get(name)),
    ...ownerFields(owners.get(name)),
  };
}

export async function listVms(): Promise<VmSummary[]> {
  const [list, stats, owners, autostart] = await Promise.all([
    virsh(['list', '--all']), domStats(), Promise.resolve(ownerMap()), autostartSet(),
  ]);
  const rows = list.split('\n').slice(2).map((line) => line.trim()).filter(Boolean).map((line) => line.split(/\s+/));
  const vms = rows
    .map((cells) => toSummary(cells, stats, owners, autostart))
    .filter((vm): vm is VmSummary => vm !== null);
  // machina's VMs first, then alphabetical: the operator's own domains are the
  // ones they touch rarely and look for by name.
  return vms.sort((left, right) => Number(!left.system) - Number(!right.system) || left.name.localeCompare(right.name));
}
