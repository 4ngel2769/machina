/**
 * Every libvirt domain on the host, not just machina's.
 *
 * Machina owns some of these (it created them from an instance row) and the
 * operator owns the rest. Both are shown, but ownership is carried explicitly
 * because it decides how a VM may be removed: a machina VM is deleted through
 * its instance row (which also frees the IP, the overlay and the seed), while a
 * foreign domain is just undefine.
 *
 * Edits are config-level by default (`--config`): a topology, boot order or
 * watchdog change cannot be applied to a running domain anyway, and pretending
 * otherwise produces a UI that says "saved" while the guest runs the old spec.
 */

import { virsh } from '@/lib/core/driver';
import { config, storagePaths } from '@/lib/config';
import { rawDb } from '@/lib/db';
import { run } from './exec';
import { isoPath } from './iso';
import fs from 'fs/promises';
import path from 'path';

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

const NAME_OK = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function assertName(name: string): string {
  if (!NAME_OK.test(name)) throw new Error('invalid domain name');
  return name;
}

function ownerMap(): Map<string, { instanceId: string; owner: VmOwner }> {
  const rows = rawDb().prepare(
    `select i.id, i.domain_name, u.id uid, u.name uname
     from instances i left join users u on u.id = i.user_id`,
  ).all() as { id: string; domain_name: string; uid: string | null; uname: string | null }[];
  const m = new Map<string, { instanceId: string; owner: VmOwner }>();
  for (const r of rows) m.set(r.domain_name, {
    instanceId: r.id,
    owner: r.uid ? { id: r.uid, name: r.uname ?? r.uid } : null,
  });
  return m;
}

/** vcpu/memory straight from libvirt, one call for the whole host. */
async function domStats(): Promise<Map<string, { vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number }>> {
  const out = new Map<string, { vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number }>();
  let txt = '';
  try { txt = await virsh(['domstats', '--list-active', '--list-inactive', '--vcpu', '--balloon']); } catch { return out; }
  let cur: { vcpu: number; vcpuMax: number; memMb: number; memMaxMb: number } | null = null;
  let name = '';
  for (const line of txt.split('\n')) {
    const head = line.match(/^Domain: '(.+)'$/);
    if (head) {
      if (name && cur) out.set(name, cur);
      name = head[1];
      cur = { vcpu: 0, vcpuMax: 0, memMb: 0, memMaxMb: 0 };
      continue;
    }
    if (!cur) continue;
    const [k, v] = line.trim().split('=');
    if (k === 'vcpu.current') cur.vcpu = Number(v);
    if (k === 'vcpu.maximum') cur.vcpuMax = Number(v);
    if (k === 'balloon.current') cur.memMb = Math.round(Number(v) / 1024);
    if (k === 'balloon.maximum') cur.memMaxMb = Math.round(Number(v) / 1024);
  }
  if (name && cur) out.set(name, cur);
  return out;
}

export async function listVms(): Promise<VmSummary[]> {
  const [list, stats, owners] = await Promise.all([virsh(['list', '--all']), domStats(), Promise.resolve(ownerMap())]);
  const autostart = new Map<string, boolean>();
  const dir = '/etc/libvirt/qemu/autostart';
  try {
    for (const f of await fs.readdir(dir)) autostart.set(f.replace(/\.xml$/, ''), true);
  } catch { /* no autostart dir yet */ }

  const rows = list.split('\n').slice(2).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/));
  const vms: VmSummary[] = [];
  for (const r of rows) {
    if (r.length < 2) continue;
    const name = r[1];
    const state = r.slice(2).join(' ');
    const st = stats.get(name);
    const own = owners.get(name);
    vms.push({
      name,
      uuid: '',
      state: /running/i.test(state) ? 'running' : /paused/i.test(state) ? 'paused' : /shut/i.test(state) ? 'stopped' : state,
      persistent: r[0] !== '-',
      autostart: autostart.get(name) ?? false,
      vcpu: st?.vcpu ?? 0, vcpuMax: st?.vcpuMax ?? 0,
      memMb: st?.memMb ?? 0, memMaxMb: st?.memMaxMb ?? 0,
      instanceId: own?.instanceId ?? null,
      owner: own?.owner ?? null,
      system: !own,
    });
  }
  return vms.sort((a, b) => Number(!a.system) - Number(!b.system) || a.name.localeCompare(b.name));
}

function attr(xml: string, tag: string, name: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${name}='([^']*)'`).exec(xml);
  return m?.[1] ?? null;
}

function elems(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>|<${tag}\\b[^>]*\\/>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
}

export async function vmDetail(name: string): Promise<VmDetail> {
  assertName(name);
  const [summaryRow] = (await listVms()).filter((v) => v.name === name);
  if (!summaryRow) throw new Error('domain not found');
  let xml = '';
  try { xml = await virsh(['dumpxml', '--inactive', name]); } catch { xml = await virsh(['dumpxml', name]); }

  const os = elems(xml, 'os')[0] ?? '';
  const boot = [...os.matchAll(/<boot\b[^>]*dev='([^']*)'/g)].map((m) => m[1]);
  const cpuBlock = elems(xml, 'cpu')[0] ?? '';
  const topo = cpuBlock.match(/<topology\b[^>]*\/>/)?.[0] ?? '';
  const cpuMode = attr(cpuBlock, 'cpu', 'mode') ?? 'custom';
  const vnc = (xml.match(/<graphics\b[^>]*type='vnc'[^>]*port='([^']*)'/) ??
    xml.match(/<graphics\b[^>]*port='([^']*)'[^>]*type='vnc'/))?.[1] ?? null;
  const spiceBlock = elems(xml, 'graphics').find((g) => /type='spice'/.test(g)) ?? '';
  const spicePort = attr(spiceBlock, 'graphics', 'port');
  const spiceTlsPort = attr(spiceBlock, 'graphics', 'tlsPort') ?? attr(spiceBlock, 'graphics', 'tlsport');
  const wd = elems(xml, 'watchdog')[0];

  const disks: VmDisk[] = elems(xml, 'disk').map((d) => ({
    target: attr(d, 'target', 'dev') ?? '',
    bus: attr(d, 'target', 'bus') ?? '',
    device: attr(d, 'disk', 'device') ?? 'disk',
    source: attr(d, 'source', 'file') ?? attr(d, 'source', 'dev') ?? '',
    format: attr(d, 'driver', 'type') ?? '',
    sizeGb: null,
  }));
  // Sizes are a qemu-img call per file: done only on the detail page, never in
  // the list, and best-effort because a foreign disk may be unreadable for us.
  for (const d of disks) {
    if (d.device !== 'disk' || !d.source || !d.source.startsWith('/')) continue;
    try {
      const info = JSON.parse(await run('qemu-img', ['info', '--output=json', '-U', d.source], { sudo: true }));
      d.sizeGb = Math.round((Number(info['virtual-size']) || 0) / 10 ** 9);
    } catch { /* keep null */ }
  }

  return {
    ...summaryRow,
    arch: attr(os, 'type', 'arch') ?? '',
    machineType: attr(os, 'type', 'machine') ?? '',
    osType: os.match(/<type[^>]*>([^<]*)<\/type>/)?.[1] ?? '',
    cpuMode,
    cpuModel: cpuBlock.match(/<model\b[^>]*>([^<]*)<\/model>/)?.[1] ?? '',
    sockets: Number(attr(topo, 'topology', 'sockets') ?? 1),
    cores: Number(attr(topo, 'topology', 'cores') ?? (summaryRow.vcpu || 1)),
    threads: Number(attr(topo, 'topology', 'threads') ?? 1),
    boot: boot.length ? boot : ['hd'],
    firmware: /<loader\b[^>]*type='pflash'|<os\b[^>]*firmware='efi'/.test(xml) ? 'efi' : 'bios',
    disks,
    nics: elems(xml, 'interface').map((i) => ({
      mac: attr(i, 'mac', 'address') ?? '',
      type: attr(i, 'interface', 'type') ?? 'network',
      source: attr(i, 'source', 'network') ?? attr(i, 'source', 'bridge') ?? attr(i, 'source', 'dev') ?? '',
      model: attr(i, 'model', 'type') ?? '',
    })),
    hostdevs: elems(xml, 'hostdev').map((h) => {
      const vendor = attr(h, 'vendor', 'id') ?? '';
      const product = attr(h, 'product', 'id') ?? '';
      const bus = attr(h, 'address', 'bus') ?? '';
      const slot = attr(h, 'address', 'slot') ?? '';
      const kind = attr(h, 'hostdev', 'type') ?? 'pci';
      return {
        kind,
        label: kind === 'usb'
          ? `usb ${vendor || '?'}:${product || '?'}`
          : `pci ${bus}:${slot}`.trim(),
        xml: h,
      };
    }),
    dirs: elems(xml, 'filesystem').map((f) => ({
      source: attr(f, 'source', 'dir') ?? '',
      target: attr(f, 'target', 'dir') ?? '',
      readonly: /<readonly\/>/.test(f),
    })),
    watchdog: wd ? { model: attr(wd, 'watchdog', 'model') ?? 'i6300esb', action: attr(wd, 'watchdog', 'action') ?? 'reset' } : null,
    vnc: vnc && vnc !== '-1' ? vnc : null,
    spice: spicePort && spicePort !== '-1'
      ? { port: Number(spicePort), tlsPort: spiceTlsPort && spiceTlsPort !== '-1' ? Number(spiceTlsPort) : null }
      : null,
  };
}

// ---------------------------------------------------------------- xml edits

async function editXml(name: string, fn: (xml: string) => string): Promise<boolean> {
  assertName(name);
  let xml = '';
  try { xml = await virsh(['dumpxml', '--inactive', name]); } catch {
    throw new Error('this domain is transient (not persistent), so it has no stored config to edit');
  }
  const next = fn(xml);
  if (next === xml) return false;
  const dir = path.join(storagePaths().root, 'xml-backups');
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(dir, `dom-${name}-${Date.now()}.xml`), xml, 'utf8').catch(() => {});
  const tmp = path.join(storagePaths().tmp, `dom-${Date.now()}.xml`);
  await fs.mkdir(path.dirname(tmp), { recursive: true });
  await fs.writeFile(tmp, next, 'utf8');
  try {
    await virsh(['define', tmp]);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
  return true;
}

const INT = (v: unknown, min: number, max: number, what: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${what} must be a whole number ${min}-${max}`);
  return n;
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

/** Apply an admin edit. Returns a human line describing what changed. */
export async function applyVmOp(name: string, op: VmOp): Promise<string> {
  assertName(name);
  const live = (await virsh(['domstate', name]).catch(() => 'shut off')).trim();
  const running = /running/i.test(live);

  switch (op.op) {
    case 'power': {
      const map: Record<string, string[]> = {
        start: ['start'], shutdown: ['shutdown'], reboot: ['reboot'], destroy: ['destroy'],
        reset: ['reset'], pause: ['suspend'], resume: ['resume'],
      };
      await virsh([...map[op.action], name]);
      return `${op.action} sent`;
    }
    case 'autostart':
      await virsh(['autostart', ...(op.on ? [] : ['--disable']), name]);
      return op.on ? 'will start with the host' : 'will not start with the host';
    case 'vcpu': {
      const max = Math.min(op.max ?? op.count, 64);
      const count = Math.min(op.count, max);
      await virsh(['setvcpus', name, String(max), '--maximum', '--config']);
      await virsh(['setvcpus', name, String(count), '--config']);
      if (running) await virsh(['setvcpus', name, String(count), '--live']).catch(() => {});
      return `${count} vCPU (max ${max})${running ? '' : ' — applies at next start'}`;
    }
    case 'memory': {
      const mb = INT(op.mb, 128, 1_048_576, 'memory MB');
      await virsh(['setmaxmem', name, `${mb}M`, '--config']);
      await virsh(['setmem', name, `${mb}M`, '--config']);
      if (running) await virsh(['setmem', name, `${mb}M`, '--live']).catch(() => {});
      return `${mb} MB${running ? '' : ' — applies at next start'}`;
    }
    case 'topology': {
      const s = INT(op.sockets, 1, 16, 'sockets');
      const c = INT(op.cores, 1, 64, 'cores');
      const t = INT(op.threads, 1, 8, 'threads');
      await editXml(name, (xml) => {
        const topo = `<topology sockets='${s}' dies='1' clusters='1' cores='${c}' threads='${t}'/>`;
        if (/<topology\b[^>]*\/>/.test(xml)) return xml.replace(/<topology\b[^>]*\/>/, topo);
        if (/<cpu\b[^>]*>/.test(xml)) return xml.replace(/(<cpu\b[^>]*>)/, `$1\n    ${topo}`);
        return xml.replace(/(<vcpu\b[^>]*>[\s\S]*?<\/vcpu>)/, `$1\n  <cpu><${topo.slice(1)}</cpu>`);
      });
      return `topology ${s}×${c}×${t} — applies at next start`;
    }
    case 'cpuMode': {
      const mode = op.mode;
      if (!['host-passthrough', 'host-model', 'custom', 'maximum'].includes(mode)) throw new Error('unsupported cpu mode');
      await editXml(name, (xml) => {
        if (/<cpu\b[^>]*mode='[^']*'/.test(xml)) return xml.replace(/(<cpu\b[^>]*mode=')[^']*(')/, `$1${mode}$2`);
        if (/<cpu\b/.test(xml)) return xml.replace(/<cpu\b/, `<cpu mode='${mode}'`);
        return xml.replace('</devices>', `</devices>`); // nothing to do without a cpu block
      });
      return `cpu mode ${mode} — applies at next start`;
    }
    case 'boot': {
      const devs = op.order.filter((d) => ['hd', 'cdrom', 'network', 'fd'].includes(d)).slice(0, 4);
      if (!devs.length) throw new Error('at least one boot device');
      await editXml(name, (xml) => {
        const seq = devs.map((d) => `    <boot dev='${d}'/>`).join('\n');
        if (/<boot\b[^>]*dev='[^']*'\/>/.test(xml)) {
          return xml.replace(/(<os\b[^>]*>[\s\S]*?)(\s*<boot\b[^>]*\/>)+/, `$1\n${seq}`);
        }
        return xml.replace(/(<os\b[^>]*>)/, `$1\n${seq}`);
      });
      return `boot order ${devs.join(' → ')}`;
    }
    case 'watchdog': {
      if (op.action === 'none') {
        await editXml(name, (xml) => xml.replace(/\s*<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/, ''));
        return 'watchdog removed';
      }
      await editXml(name, (xml) => {
        // Keep whatever model the domain already declares. A guest only has the
        // driver for the model it was built against, so swapping i6300esb in
        // over an itco watchdog would silently stop it firing.
        const model = xml.match(/<watchdog\b[^>]*model='([^']*)'/)?.[1] ?? 'i6300esb';
        const el = `<watchdog model='${model}' action='${op.action}'/>`;
        if (/<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/.test(xml)) return xml.replace(/<watchdog\b[\s\S]*?(?:\/>|<\/watchdog>)/, el);
        return xml.replace('</devices>', `  ${el}\n</devices>`);
      });
      return `watchdog action ${op.action} — applies at next start`;
    }
    case 'diskAttach': {
      const gb = INT(op.sizeGb, 1, 2000, 'disk GB');
      const detail = await vmDetail(name);
      const used = new Set(detail.disks.map((d) => d.target));
      let free = '';
      for (let i = 0; i < 26; i += 1) {
        const cand = `vd${String.fromCharCode(97 + i)}`;
        if (!used.has(cand)) { free = cand; break; }
      }
      if (!free) throw new Error('no free vd* slot left');
      const file = path.join(storagePaths().vms, `hot-${name}-${free}-${Date.now()}.qcow2`);
      await run('qemu-img', ['create', '-f', 'qcow2', file, `${gb}G`], { sudo: true });
      await run('chown', ['libvirt-qemu:kvm', file], { sudo: true }).catch(() => {});
      await virsh(['attach-disk', name, file, free, '--driver', 'qemu', '--subdriver', 'qcow2',
        '--targetbus', op.bus === 'sata' ? 'sata' : 'virtio', '--config']);
      return `attached ${gb}G as ${free} — appears at next start`;
    }
    case 'diskDetach':
      await virsh(['detach-disk', name, op.target, '--config']);
      return `detached ${op.target} — applies at next start`;
    case 'nicAttach': {
      await virsh(['attach-interface', name, '--type', 'network', '--source', op.network,
        '--model', op.model === 'e1000' ? 'e1000' : 'virtio', '--config']);
      return `added a network interface on ${op.network} — applies at next start`;
    }
    case 'nicDetach':
      await virsh(['detach-interface', name, '--type', 'network', '--mac', op.mac, '--config']);
      return `removed interface ${op.mac}`;
    case 'hostdevAttach': {
      const v = op.vendor.replace(/^0x/, '');
      const p = op.product.replace(/^0x/, '');
      if (!/^[0-9a-f]{4}$/i.test(v) || !/^[0-9a-f]{4}$/i.test(p)) throw new Error('vendor and product must be 4 hex digits');
      const xml = `<hostdev mode='subsystem' type='usb' managed='yes'>
  <source><vendor id='0x${v}'/><product id='0x${p}'/></source>
</hostdev>`;
      const tmp = path.join(storagePaths().tmp, `hostdev-${Date.now()}.xml`);
      await fs.mkdir(path.dirname(tmp), { recursive: true });
      await fs.writeFile(tmp, xml, 'utf8');
      try { await virsh(['attach-device', name, tmp, '--config']); } finally { await fs.rm(tmp, { force: true }).catch(() => {}); }
      return `USB ${v}:${p} attached — applies at next start`;
    }
    case 'hostdevDetach': {
      const detail = await vmDetail(name);
      const dev = detail.hostdevs[op.index];
      if (!dev) throw new Error('no such host device on this domain');
      const tmp = path.join(storagePaths().tmp, `hostdev-${Date.now()}.xml`);
      await fs.mkdir(path.dirname(tmp), { recursive: true });
      await fs.writeFile(tmp, dev.xml, 'utf8');
      try { await virsh(['detach-device', name, tmp, '--config']); } finally { await fs.rm(tmp, { force: true }).catch(() => {}); }
      return 'host device removed';
    }
    case 'dirAttach': {
      if (!op.source.startsWith('/')) throw new Error('shared dir must be an absolute path');
      if (!/^[a-zA-Z0-9_.-]{1,32}$/.test(op.tag)) throw new Error('mount tag: letters, digits, . _ -');
      await editXml(name, (xml) => xml.replace('</devices>',
        `  <filesystem type='mount' accessmode='passthrough'>
    <source dir='${op.source}'/>
    <target dir='${op.tag}'/>
  </filesystem>\n</devices>`));
      return `shared ${op.source} as tag ${op.tag} — mount it in the guest with -t 9p`;
    }
    case 'dirDetach':
      await editXml(name, (xml) => {
        const el = elems(xml, 'filesystem').find((f) => attr(f, 'target', 'dir') === op.tag);
        if (!el) throw new Error(`no shared dir tagged ${op.tag}`);
        return xml.replace(el, '');
      });
      return `shared dir ${op.tag} removed`;
    case 'isoAttach': {
      // A cdrom's source is a startup property. Swapping it on a live domain is
      // a change-media job with its own eject/insert dance, and doing it
      // half-way is how a guest ends up with a locked tray it cannot boot past.
      if (running) throw new Error('stop the VM first: media is inserted in the stored config');
      const file = await isoPath(op.iso);
      const st = await fs.stat(file).catch(() => null);
      if (!st?.isFile()) throw new Error('no such iso — refresh the list');
      const detail = await vmDetail(name);
      const used = new Set(detail.disks.map((d) => d.target));
      // The seed already owns vdb, so installer media goes on the sata bus as
      // sd*, exactly where a BIOS looks for a boot cdrom.
      let free = '';
      for (let i = 0; i < 26; i += 1) {
        const cand = `sd${String.fromCharCode(97 + i)}`;
        if (!used.has(cand)) { free = cand; break; }
      }
      if (!free) throw new Error('no free sata slot left');
      await virsh(['attach-disk', name, file, free,
        '--type', 'cdrom', '--mode', 'readonly',
        '--driver', 'qemu', '--subdriver', 'raw',
        '--targetbus', 'sata', '--config']);
      return `inserted ${op.iso} as ${free} — appears at next start`;
    }
    case 'isoDetach':
      await virsh(['detach-disk', name, op.target, '--config']);
      return `ejected ${op.target} — applies at next start`;
    case 'spice': {
      if (running) throw new Error('stop the VM first: SPICE graphics changes apply to stored config');
      await editXml(name, (xml) => {
        const existing = elems(xml, 'graphics').find((g) => /type='spice'/.test(g));
        if (!op.on) return existing ? xml.replace(existing, '') : xml;
        if (existing) return xml;
        return xml.replace('</devices>', "    <graphics type='spice' autoport='yes' listen='127.0.0.1'><listen type='address' address='127.0.0.1'/></graphics>\n  </devices>");
      });
      return op.on ? 'SPICE enabled on loopback — applies at next start' : 'SPICE disabled';
    }
    default:
      throw new Error('unknown operation');
  }
}

/** Undefine a domain nothing else owns. Machina VMs are deleted via instances. */
export async function undefineVm(name: string): Promise<void> {
  assertName(name);
  const row = rawDb().prepare(`select 1 from instances where domain_name=?`).get(name);
  if (row) throw new Error('this is a machina instance — delete it from the instances page so its disk, IP and seed are freed too');
  const state = (await virsh(['domstate', name]).catch(() => '')).trim();
  if (/running/i.test(state)) throw new Error('stop the VM before removing its definition');
  await virsh(['undefine', name]);
}

export function domainPrefix(): string {
  return config.domainPrefix;
}
