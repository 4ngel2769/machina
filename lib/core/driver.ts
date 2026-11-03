import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import { mkdirSync, existsSync } from 'fs';
import { storagePaths, config } from '@/lib/config';

const pexec = promisify(execFile);

async function virsh(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await pexec(config.virshBin, ['-c', config.virshUri, ...args], {
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.trim();
}

async function geniso(outPath: string, dir: string): Promise<void> {
  await pexec(config.genisoBin, [
    '-output', outPath,
    '-volid', 'cidata',
    '-joliet',
    '-rock',
    'user-data', 'meta-data', 'network-config',
  ], { cwd: dir, timeout: 30_000 });
}

// ---------------------------------------------------------------- networking

export function macFromId(id: string): string {
  // Deterministic, collision-safe for our scale: 52:54:00:XX:XX:XX from an
  // FNV-1a hash OF THE CHARACTER CODES.
  //
  // BUG THIS FIXES: the loop iterated `for (const c of id)` but never used `c`,
  // so the hash only depended on id.length. Every instance id has the same
  // length ('vm_' + 16 hex), so EVERY VM was handed the identical MAC. They
  // collided on the bridge, only one could take an address, and the rest hung
  // in systemd-networkd-wait-online until the SSH timeout killed provisioning.
  // Math.imul keeps the multiply in 32-bit; a plain `*` loses precision above
  // 2^53 and silently collides even sooner.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  h = (h ^ (id.length * 31)) >>> 0;
  const b2 = (h & 0xff).toString(16).padStart(2, '0');
  const b1 = ((h >> 8) & 0xff).toString(16).padStart(2, '0');
  const b0 = ((h >> 16) & 0xff).toString(16).padStart(2, '0');
  return `52:54:00:${b0}:${b1}:${b2}`;
}

/**
 * Allocate the lowest free IPv4 in config.ipRange that no row in `taken` uses.
 * Caller passes the set of IPs already claimed.
 */
export class IpAllocator {
  private taken: Set<string>;
  constructor(taken: string[]) {
    this.taken = new Set(taken);
  }
  next(): string | null {
    const [start, end] = config.ipRange.split('-').map((s) => s.trim());
    const s4 = start.split('.').map((n) => parseInt(n, 10));
    const e4 = end.split('.').map((n) => parseInt(n, 10));
    const toInt = (a: number[]) => ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
    let cur = toInt(s4);
    const stop = toInt(e4);
    const base = s4.slice(0, 3).join('.');
    while (cur <= stop) {
      const ip = `${base}.${cur & 0xff}`;
      if (!this.taken.has(ip)) return ip;
      const last = cur & 0xff;
      if (last === 255) return null;
      cur++;
    }
    return null;
  }
}

// ---------------------------------------------------------------- pools/nets

async function poolExists(name: string): Promise<boolean> {
  try { await virsh(['pool-info', name]); return true; } catch { return false; }
}

async function poolDefineDir(name: string, dir: string): Promise<void> {
  await virsh(['pool-define-as', name, 'dir', '--target', dir]);
}

async function netExists(name: string): Promise<boolean> {
  try { await virsh(['net-info', name]); return true; } catch { return false; }
}

async function ensureSetup(): Promise<void> {
  const sp = storagePaths();
  for (const d of [sp.root, sp.images, sp.vms, sp.seeds, sp.vnc, sp.tmp, sp.ssh, sp.serial]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  await pexec('chmod', ['1777', sp.vnc]).catch(() => {});

  // Pools: two dir-type pools over the layout dirs.
  for (const [name, dir] of [
    [config.imagePool, sp.images],
    [config.vmsPool, sp.vms],
  ] as const) {
    try {
      if (!(await poolExists(name))) await poolDefineDir(name, dir);
      await virsh(['pool-start', name]).catch(() => {});
    } catch (e) {
      console.log(`[driver] pool ${name} ensure failed (non-fatal): ${(e as Error).message}`);
    }
  }

  // NAT network: gateway .1 (libvirtd dnsmasq), one /24.
  try {
    if (!(await netExists(config.network))) {
      const xml = `<network><name>${config.network}</name><forward mode='nat'><nat><port start='1024' end='65535'/></nat></forward><bridge name='${config.bridgeName}' stp='on' delay='0'/><ip address='${config.gateway}' netmask='255.255.255.0'><dhcp><range start='${config.ipRange.split('-')[0].trim()}' end='${config.ipRange.split('-')[1].trim()}'/></dhcp></ip></network>`;
      const tmp = `${sp.tmp}/net-${Date.now()}.xml`;
      await fs.writeFile(tmp, xml);
      try {
        await virsh(['net-define', tmp]);
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => {});
      }
    }
    await virsh(['net-start', config.network]).catch(() => {});
  } catch (e) {
    console.log(`[driver] network ${config.network} ensure failed (non-fatal): ${(e as Error).message}`);
  }
}

/** Idempotent; safe on every boot; errors degrade to log warnings. */
export async function ensureSetupSafe(): Promise<void> {
  try {
    await ensureSetup();
  } catch (e) {
    console.log('[driver] ensureSetup failed (continuing degraded):', (e as Error).message);
  }
}

export async function ensureIpLease(mac: string, ip: string): Promise<void> {
  try {
    await virsh(['net-update', config.network, 'add', 'ip-dhcp-host', `<host mac='${mac}' ip='${ip}'/>`, '--config']);
  } catch (e) {
    // Not fatal: cloud-init sets a static IP anyway. DHCP entry is belt+braces.
    console.log(`[driver] dhcp lease update failed (non-fatal): ${(e as Error).message}`);
  }
}

export async function removeIpLease(mac: string): Promise<void> {
  try {
    await virsh(['net-update', config.network, 'delete', 'ip-dhcp-host', `<host mac='${mac}'/>`, '--config', '--live']);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- domains

export interface DomInfo {
  name: string;
  state: string;
  uuid: string;
}

export async function listDomains(): Promise<DomInfo[]> {
  const out = await virsh(['list', '--all']);
  const rows: DomInfo[] = [];
  for (const line of out.split('\n').slice(2)) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 3) continue;
    const name = parts[1];
    const state = parts.slice(2).join(' ');
    let uuid = '';
    try { uuid = (await virsh(['domuuid', name])).trim(); } catch { /* gone */ }
    rows.push({ name, state, uuid });
  }
  return rows;
}

export async function domState(name: string): Promise<string | null> {
  try {
    const out = await virsh(['domstate', name]);
    return out.trim();
  } catch {
    return null;
  }
}

export function domainXml(opts: {
  domainName: string;
  instanceId: string;
  vcpu: number;
  ramMb: number;
  /** Absolute path of the instance's qcow2 overlay disk. */
  diskVolPath: string;
  seedIsoPath: string;
  mac: string;
  vncSocket: string;
  vncPass: string;
  serialPath: string;
}): string {
  const { domainName, instanceId, vcpu, ramMb, diskVolPath, seedIsoPath, mac, vncSocket, vncPass, serialPath } = opts;
  return `<?xml version="1.0"?>
<domain type='kvm'>
  <name>${domainName}</name>
  <memory unit='MiB'>${ramMb}</memory>
  <currentMemory unit='MiB'>${ramMb}</currentMemory>
  <vcpu placement='static'>${vcpu}</vcpu>
  <metadata>
    <machina:instance xmlns:machina='https://machina.local/xmlns/machina/1.0'>${instanceId}</machina:instance>
  </metadata>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
    <boot dev='cdrom'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-model'/>
  <clock offset='utc'/>
  <on_poweroff>destroy</on_poweroff>
  <on_reboot>restart</on_reboot>
  <on_crash>restart</on_crash>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' discard='unmap'/>
      <source file='${diskVolPath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <disk type='file' device='cdrom'>
      <driver name='qemu' type='raw'/>
      <source file='${seedIsoPath}'/>
      <target dev='sda' bus='sata'/>
      <readonly/>
    </disk>
    <interface type='network'>
      <mac address='${mac}'/>
      <source network='${config.network}'/>
      <model type='virtio'/>
    </interface>
    <serial type='file'>
      <source path='${serialPath}'/>
      <target port='0'/>
    </serial>
    <rng model='virtio'>
      <backend model='random'>/dev/urandom</backend>
    </rng>
    <console type='pty'/>
    <graphics type='vnc' socket='${vncSocket}' passwd='${vncPass}'/>
    <video>
      <model type='virtio'/>
    </video>
    <input type='tablet' bus='usb'/>
    <memballoon model='virtio'/>
  </devices>
</domain>`;
}

export async function defineDomain(xml: string): Promise<void> {
  const tmp = `${storagePaths().tmp}/define-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xml`;
  await fs.writeFile(tmp, xml);
  try {
    await virsh(['define', tmp]);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

export async function startDomain(name: string): Promise<void> {
  await virsh(['start', name]);
}

export async function shutdownDomain(name: string): Promise<void> {
  await virsh(['shutdown', name]);
}

export async function rebootDomain(name: string): Promise<void> {
  await virsh(['reboot', name]);
}

/** Resume a paused domain. `virsh start` refuses a paused domain, so the
 *  distinction between paused and shut-off is load-bearing, not cosmetic. */
export async function resumeDomain(name: string): Promise<void> {
  await virsh(['resume', name]);
}

/**
 * Bring a domain to "running" from whatever state it is actually in.
 * `virsh start` only works from shut-off, and fails with a confusing
 * "Domain is already active" if the domain is paused or already running, so
 * every caller that wants "running" should go through here.
 */
export async function ensureRunning(name: string): Promise<void> {
  const st = await domState(name);
  if (st && /running/i.test(st) && !/paused/i.test(st)) return; // already there
  if (st && /paused/i.test(st)) {
    await resumeDomain(name);
    return;
  }
  await startDomain(name);
}

export async function destroyDomain(name: string): Promise<void> {
  await virsh(['destroy', name]).catch(() => {});
}

export async function undefineDomain(name: string): Promise<void> {
  try {
    await virsh(['undefine', name, '--nvram']);
  } catch {
    /* already gone */
  }
}

export async function volResize(volName: string, newGb: number): Promise<void> {
  await virsh(['vol-resize', volName, '--pool', config.vmsPool, '--capacity', `${newGb}GiB`]);
}

// ------------------------------------------------------- interface stats/tune

export interface IfaceStat {
  domain: string;
  dev: string;
  rxBytes: number;
  txBytes: number;
}

/** One `domstats --interface` call for every domain; parsed per (domain, net.N). */
export async function domNetStats(): Promise<IfaceStat[]> {
  const out = await virsh(['domstats', '--interface']);
  const stats: IfaceStat[] = [];
  let domain = '';
  const byIdx = new Map<number, { dev: string; rx: number; tx: number }>();
  const flush = () => {
    for (const s of byIdx.values()) {
      if (s.dev) stats.push({ domain, dev: s.dev, rxBytes: s.rx, txBytes: s.tx });
    }
    byIdx.clear();
  };
  for (const line of out.split('\n')) {
    let m = /^Domain: '(.+)'/.exec(line.trim());
    if (m) { flush(); domain = m[1]; continue; }
    m = /^\s*net\.(\d+)\.(name|rx\.bytes|tx\.bytes)=(.+)$/.exec(line);
    if (!m || !domain) continue;
    const idx = parseInt(m[1], 10);
    const cur = byIdx.get(idx) ?? { dev: '', rx: 0, tx: 0 };
    if (m[2] === 'name') cur.dev = m[3].trim();
    else if (m[2] === 'rx.bytes') cur.rx = parseInt(m[3], 10) || 0;
    else cur.tx = parseInt(m[3], 10) || 0;
    byIdx.set(idx, cur);
  }
  flush();
  return stats;
}

/** Live interface throttle in KB/s. 0/0 clears the limit entirely. */
export async function tuneIface(domain: string, mac: string, inKb: number, outKb: number): Promise<void> {
  await virsh(['domiftune', domain, mac, '--live',
    '--inbound', String(inKb), '--outbound', String(outKb)]);
}

/** Current live averages, or null when the domain/iface is gone. */
export async function readIfaceTune(domain: string, mac: string): Promise<{ inAvg: number; outAvg: number } | null> {
  let out: string;
  try {
    out = await virsh(['domiftune', domain, mac, '--current']);
  } catch {
    return null;
  }
  const gi = (k: string): number => {
    const m = new RegExp(`^${k}:\\s*(\\d+)`, 'm').exec(out);
    return m ? parseInt(m[1], 10) : 0;
  };
  return { inAvg: gi('inbound\\.average'), outAvg: gi('outbound\\.average') };
}

export async function vmGenIdNameList(): Promise<string[]> {
  const doms = await listDomains();
  return doms.filter((d) => d.name.startsWith(config.domainPrefix)).map((d) => d.name);
}

// ---------------------------------------------------------------- snapshots

/**
 * Snapshot names reach libvirt as an XML attribute and end up on a command
 * line, so the whitelist is the security boundary, not a style choice:
 * lowercase alphanumerics and dashes only, 1..40 chars, must start with a
 * letter or digit. That excludes quotes, angle brackets, spaces, slashes,
 * newlines and every shell metacharacter in one step.
 */
export const SNAPSHOT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type DomSnapshot = {
  name: string;
  description: string;
  state: string; // disk | running | quiesced
  isCurrent: boolean;
  /** Bytes this snapshot ADDED to the disk, as virsh reports it. */
  sizeBytes: number;
  createdAt: number;
};

/** Reject anything that is not a plain label, before it reaches libvirt. */
export function assertSnapshotName(name: string): string {
  const n = String(name ?? '').trim().toLowerCase();
  if (!SNAPSHOT_NAME_RE.test(n)) {
    throw new Error(
      'snapshot names must be 1-40 characters of lowercase letters, digits and dashes',
    );
  }
  return n;
}

/**
 * List a domain's snapshots. Parses `virsh snapshot-list` (one line per
 * snapshot, tabs separating name/state/parent time) and cross-checks the
 * default/parent flag so `current` is honest. Size and creation time come
 * from `snapshot-info` per snapshot, which is the only place virsh exposes a
 * per-snapshot disk delta.
 */
export async function listSnapshots(domainName: string): Promise<DomSnapshot[]> {
  // The human-readable table is the ONLY source of creation time on
  // libvirt 10.0. `snapshot-list --name` gives names with no timestamps, and
  // `snapshot-info <dom>` without a name is an error ("--snapshotname or
  // --current is required"). Columns are separated by runs of spaces.
  const table = await virsh(['snapshot-list', domainName], 30_000);
  const rows: DomSnapshot[] = [];
  for (const line of table.split('\n')) {
    const t = line.trim();
    if (!t || /^-+$/.test(t) || /^Name\s/.test(t)) continue;
    const cols = t.split(/\s{2,}/);
    const name = (cols[0] ?? '').trim();
    if (!name || !SNAPSHOT_NAME_RE.test(name.toLowerCase())) continue;
    const row: DomSnapshot = {
      name,
      description: '',
      state: (cols[2] ?? '').trim() || 'disk',
      isCurrent: false,
      // libvirt 10 reports no per-snapshot disk delta here. Leave it 0 rather
      // than fabricate one; the panel reports real cumulative disk use.
      sizeBytes: 0,
      createdAt: 0,
    };
    if (cols[1]) {
      const parsed = Date.parse(cols[1].trim());
      if (Number.isFinite(parsed)) row.createdAt = parsed;
    }
    rows.push(row);
  }

  // `current`, description and children live in the per-snapshot form, whose
  // flag is --snapshotname (there is no --snapshot).
  for (const row of rows) {
    try {
      const info = await virsh(
        ['snapshot-info', domainName, '--snapshotname', row.name], 20_000,
      );
      const cur = /^Current:\s+(\S+)/mi.exec(info);
      row.isCurrent = cur ? /^yes$/i.test(cur[1]) : false;
      const ds = /Description:\s*(.*)/i.exec(info);
      if (ds && ds[1].trim()) row.description = ds[1].trim();
    } catch {
      // One unreadable snapshot must not hide the rest of the list.
    }
  }
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

/**
 * Create an INTERNAL snapshot (metadata stored inside the qcow2 overlay).
 * `--atomic` is only valid on a shut-off domain: it stages the snapshot in a
 * temp file and renames, which libvirt refuses for a live guest.
 */
export async function createSnapshot(
  domainName: string,
  name: string,
  description = '',
): Promise<void> {
  const snap = assertSnapshotName(name);
  const live = await isDomainRunning(domainName);
  const args = ['snapshot-create-as', domainName, snap];
  if (!live) args.push('--atomic');
  if (description) args.push('--description', description.slice(0, 200));
  await virsh(args, 300_000); // large disks: a snapshot is not instant
}

/** Revert the disk to a snapshot. Refuses unless the snapshot exists. */
export async function revertSnapshot(domainName: string, name: string): Promise<void> {
  const snap = assertSnapshotName(name);
  const names = (await listSnapshots(domainName)).map((s) => s.name);
  if (!names.includes(snap)) throw new Error(`no snapshot named "${snap}"`);
  await virsh(['snapshot-revert', domainName, snap], 600_000);
}

/**
 * Delete one snapshot, refusing when it has descendants.
 *
 * libvirt 10's `snapshot-delete` takes the whole subtree with it and says
 * nothing: deleting the oldest snapshot of three silently destroyed the other
 * two. For a rented VM that is data loss the tenant never asked for and never
 * saw, so check the child count first and make the user delete newest-first.
 */
export async function deleteSnapshot(domainName: string, name: string): Promise<void> {
  const snap = assertSnapshotName(name);
  const listed = (await listSnapshots(domainName)).map((s) => s.name);
  if (!listed.includes(snap)) throw new Error(`no snapshot named "${snap}"`);
  try {
    const info = await virsh(
      ['snapshot-info', domainName, '--snapshotname', snap], 20_000,
    );
    const children = /^Children:\s+(\d+)/mi.exec(info);
    const descendants = /^Descendants:\s+(\d+)/mi.exec(info);
    const n = Math.max(Number(children?.[1] ?? 0), Number(descendants?.[1] ?? 0));
    if (n > 0) {
      throw new Error(
        `"${snap}" has ${n} newer snapshot${n === 1 ? '' : 's'} on top of it — delete ${n === 1 ? 'that one' : 'those'} first`,
      );
    }
  } catch (e) {
    // Only the deliberate refusal above may abort here; an unreadable
    // snapshot-info must not be read as "safe to delete".
    if ((e as Error).message?.includes('newer snapshot')) throw e;
  }
  try {
    await virsh(['snapshot-delete', domainName, snap], 120_000);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/not found|no such/i.test(msg)) throw new Error(`no snapshot named "${snap}"`);
    throw e;
  }
}

/** True only when libvirt reports the domain running. A destroyed domain is
 *  NOT running, which is what makes --atomic safe above. */
export async function isDomainRunning(domainName: string): Promise<boolean> {
  try {
    return await domState(domainName) === 'running';
  } catch {
    return false;
  }
}

/** Real bytes occupied by the overlay (data + internal snapshot deltas), and
 *  the free space left on the pool that holds it. Both are quota inputs. */
export async function diskUsage(
  volName: string,
): Promise<{ actualBytes: number; virtualBytes: number; freeMb: number } | null> {
  try {
    const { stdout } = await pexec(config.qemuImgBin, [
      // -U (force share) is mandatory, not an optimisation: a running domain
      // holds an exclusive write lock on this qcow2, so a plain `qemu-img info`
      // fails with "Failed to get shared write lock" for exactly the instances
      // whose usage we most want to see.
      'info', '-U', '--output=json', `-f`, 'qcow2', `${storagePaths().vms}/${volName}.qcow2`,
    ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
    const info = JSON.parse(stdout) as { 'actual-size': number; 'virtual-size': number };
    let freeMb = 0;
    try {
      const st = await fs.statfs(storagePaths().vms);
      // statfs: bsize * bavail = bytes available to an unprivileged writer
      freeMb = Math.floor((Number(st.bsize) * Number(st.bavail)) / (1024 * 1024));
    } catch {
      freeMb = 0;
    }
    return {
      actualBytes: Number(info['actual-size']) || 0,
      virtualBytes: Number(info['virtual-size']) || 0,
      freeMb,
    };
  } catch {
    return null; // no disk yet, or unreadable: caller decides what that means
  }
}

// ---------------------------------------------------------------- metrics

export type DomStats = {
  /** Cumulative guest vCPU runtime in nanoseconds, summed over all vcpus. */
  cpuTimeNs: number;
  ncpu: number;
  /** Guest RAM actually in use, KiB (balloon.current). */
  ramKb: number;
  /** RAM the guest was given, KiB (balloon.maximum). */
  ramMaxKb: number;
  rdBytes: number;
  wrBytes: number;
  /** Bytes the hypervisor has allocated for the guest disk. */
  allocBytes: number;
};

/**
 * Read a domain's live counters from the HYPERVISOR: cumulative vCPU time,
 * balloon-reported guest RAM, and per-disk I/O counters.
 *
 * Deliberately NOT the QEMU guest agent. The agent is a QMP-style RPC channel
 * that runs commands inside the guest — effectively root in every rented VM,
 * and a per-tenant attack surface on a multi-tenant host. Everything needed for
 * a load chart is already here, works on all six distros, and needs nothing
 * installed in the guest. The cost is that guest-visible filesystem usage is
 * unavailable, which the disk allocation figure covers well enough.
 *
 * Returns null for a domain that is gone or shut off rather than throwing, so
 * one dead guest cannot abort a sweep over the others.
 */
export async function domStats(domainName: string): Promise<DomStats | null> {
  let out: string;
  try {
    out = await virsh(['domstats', '--domain', domainName, '--vcpu', '--balloon', '--block'], 15_000);
  } catch {
    return null;
  }
  const kv = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^\s*([\w.]+)=(\S+)\s*$/.exec(line);
    if (m) kv.set(m[1], m[2]);
  }

  let cpuTimeNs = 0;
  let ncpu = 0;
  for (const [k, v] of kv) {
    const m = /^vcpu\.(\d+)\.time$/.exec(k);
    if (!m) continue;
    const t = Number(v);
    if (Number.isFinite(t)) { cpuTimeNs += t; ncpu += 1; }
  }
  // A guest that never ran has no vcpu.N.time rows; fall back to the configured
  // count so CPU% still divides by the right denominator (and reads 0).
  if (!ncpu) ncpu = Number(kv.get('vcpu.current') ?? 0) || 0;

  // block.N counters are per disk. Pick the guest disk by its path: the vms/
  // pool is the instance's own disk, seeds/ is the read-only cloud-init ISO
  // whose write counters are meaningless noise.
  let rdBytes = 0;
  let wrBytes = 0;
  let allocBytes = 0;
  for (const [k, v] of kv) {
    const idx = /^block\.(\d+)\./.exec(k)?.[1];
    if (idx === undefined) continue;
    const path = kv.get(`block.${idx}.path`) ?? '';
    if (!path.includes('/vms/')) continue;
    if (k === `block.${idx}.rd.bytes`) rdBytes = Number(v) || 0;
    if (k === `block.${idx}.wr.bytes`) wrBytes = Number(v) || 0;
    if (k === `block.${idx}.allocation`) allocBytes = Number(v) || 0;
  }

  const ramKb = Number(kv.get('balloon.current') ?? 0) || 0;
  const ramMaxKb = Number(kv.get('balloon.maximum') ?? 0) || 0;
  if (!cpuTimeNs && !ramKb && !rdBytes && !wrBytes && !allocBytes) return null;
  return { cpuTimeNs, ncpu, ramKb, ramMaxKb, rdBytes, wrBytes, allocBytes };
}

export { virsh, geniso };
