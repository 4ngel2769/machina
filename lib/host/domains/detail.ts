/**
 * Everything one domain's page needs: the summary row plus the hardware read
 * out of its XML. Disk sizes cost a qemu-img call each, so they are resolved
 * here and nowhere else.
 */
import { virsh } from '@/lib/core/driver';
import { run } from '../exec';
import { listVms } from './list';
import { assertName, attr, elems } from './xml';
import type { VmDetail, VmDir, VmDisk, VmHostdev, VmNic } from './types';

async function loadXml(name: string): Promise<string> {
  try {
    return await virsh(['dumpxml', '--inactive', name]);
  } catch {
    return virsh(['dumpxml', name]);
  }
}

function parseBoot(os: string): string[] {
  const boot = [...os.matchAll(/<boot\b[^>]*dev='([^']*)'/g)].map((m) => m[1]);
  return boot.length ? boot : ['hd'];
}

/** Firmware is EFI when a pflash loader is present or <os firmware='efi'>. */
function isEfi(xml: string): boolean {
  return /<loader\b[^>]*type='pflash'|<os\b[^>]*firmware='efi'/.test(xml);
}

function parseOs(xml: string): Pick<VmDetail, 'arch' | 'machineType' | 'osType' | 'boot' | 'firmware'> {
  const os = elems(xml, 'os')[0] ?? '';
  return {
    arch: attr(os, 'type', 'arch') ?? '',
    machineType: attr(os, 'type', 'machine') ?? '',
    osType: os.match(/<type[^>]*>([^<]*)<\/type>/)?.[1] ?? '',
    boot: parseBoot(os),
    firmware: isEfi(xml) ? 'efi' : 'bios',
  };
}

function parseTopology(cpuBlock: string, fallbackVcpu: number): Pick<VmDetail, 'sockets' | 'cores' | 'threads'> {
  const topo = cpuBlock.match(/<topology\b[^>]*\/>/)?.[0] ?? '';
  return {
    sockets: Number(attr(topo, 'topology', 'sockets') ?? 1),
    cores: Number(attr(topo, 'topology', 'cores') ?? (fallbackVcpu || 1)),
    threads: Number(attr(topo, 'topology', 'threads') ?? 1),
  };
}

function parseCpu(xml: string, fallbackVcpu: number): Pick<VmDetail, 'cpuMode' | 'cpuModel' | 'sockets' | 'cores' | 'threads'> {
  const cpuBlock = elems(xml, 'cpu')[0] ?? '';
  return {
    cpuMode: attr(cpuBlock, 'cpu', 'mode') ?? 'custom',
    cpuModel: cpuBlock.match(/<model\b[^>]*>([^<]*)<\/model>/)?.[1] ?? '',
    ...parseTopology(cpuBlock, fallbackVcpu),
  };
}

/** VNC port, or null when libvirt auto-allocates (-1) or uses a socket. */
function parseVncPort(xml: string): string | null {
  const vnc = (xml.match(/<graphics\b[^>]*type='vnc'[^>]*port='([^']*)'/) ??
    xml.match(/<graphics\b[^>]*port='([^']*)'[^>]*type='vnc'/))?.[1] ?? null;
  if (!vnc || vnc === '-1') return null;
  return vnc;
}

/** SPICE ports when a spice graphics element is present and not auto-allocated. */
function parseSpice(xml: string): VmDetail['spice'] {
  const spiceBlock = elems(xml, 'graphics').find((g) => /type='spice'/.test(g)) ?? '';
  const spicePort = attr(spiceBlock, 'graphics', 'port');
  const spiceTlsPort = attr(spiceBlock, 'graphics', 'tlsPort') ?? attr(spiceBlock, 'graphics', 'tlsport');
  if (!spicePort || spicePort === '-1') return null;
  const tls = spiceTlsPort && spiceTlsPort !== '-1' ? Number(spiceTlsPort) : null;
  return { port: Number(spicePort), tlsPort: tls };
}

function parseGraphics(xml: string): Pick<VmDetail, 'vnc' | 'spice'> {
  return { vnc: parseVncPort(xml), spice: parseSpice(xml) };
}

function parseDisks(xml: string): VmDisk[] {
  return elems(xml, 'disk').map((d) => ({
    target: attr(d, 'target', 'dev') ?? '',
    bus: attr(d, 'target', 'bus') ?? '',
    device: attr(d, 'disk', 'device') ?? 'disk',
    source: attr(d, 'source', 'file') ?? attr(d, 'source', 'dev') ?? '',
    format: attr(d, 'driver', 'type') ?? '',
    sizeGb: null,
  }));
}

/** Best-effort size, kept null when a foreign disk is unreadable for us. */
async function withDiskSizes(disks: VmDisk[]): Promise<VmDisk[]> {
  for (const d of disks) {
    if (d.device !== 'disk' || !d.source || !d.source.startsWith('/')) continue;
    try {
      const info = JSON.parse(await run('qemu-img', ['info', '--output=json', '-U', d.source], { sudo: true }));
      d.sizeGb = Math.round((Number(info['virtual-size']) || 0) / 10 ** 9);
    } catch { /* keep null */ }
  }
  return disks;
}

function parseNics(xml: string): VmNic[] {
  return elems(xml, 'interface').map((i) => ({
    mac: attr(i, 'mac', 'address') ?? '',
    type: attr(i, 'interface', 'type') ?? 'network',
    source: attr(i, 'source', 'network') ?? attr(i, 'source', 'bridge') ?? attr(i, 'source', 'dev') ?? '',
    model: attr(i, 'model', 'type') ?? '',
  }));
}

function hostdevLabel(kind: string, vendor: string, product: string, bus: string, slot: string): string {
  if (kind === 'usb') return `usb ${vendor || '?'}:${product || '?'}`;
  return `pci ${bus}:${slot}`.trim();
}

function parseHostdevs(xml: string): VmHostdev[] {
  return elems(xml, 'hostdev').map((h) => {
    const vendor = attr(h, 'vendor', 'id') ?? '';
    const product = attr(h, 'product', 'id') ?? '';
    const bus = attr(h, 'address', 'bus') ?? '';
    const slot = attr(h, 'address', 'slot') ?? '';
    const kind = attr(h, 'hostdev', 'type') ?? 'pci';
    return { kind, label: hostdevLabel(kind, vendor, product, bus, slot), xml: h };
  });
}

function parseDirs(xml: string): VmDir[] {
  return elems(xml, 'filesystem').map((f) => ({
    source: attr(f, 'source', 'dir') ?? '',
    target: attr(f, 'target', 'dir') ?? '',
    readonly: /<readonly\/>/.test(f),
  }));
}

function parseWatchdog(xml: string): VmDetail['watchdog'] {
  const wd = elems(xml, 'watchdog')[0];
  if (!wd) return null;
  return {
    model: attr(wd, 'watchdog', 'model') ?? 'i6300esb',
    action: attr(wd, 'watchdog', 'action') ?? 'reset',
  };
}

export async function vmDetail(name: string): Promise<VmDetail> {
  assertName(name);
  const [summaryRow] = (await listVms()).filter((v) => v.name === name);
  if (!summaryRow) throw new Error('domain not found');
  const xml = await loadXml(name);
  return {
    ...summaryRow,
    ...parseOs(xml),
    ...parseCpu(xml, summaryRow.vcpu),
    ...parseGraphics(xml),
    disks: await withDiskSizes(parseDisks(xml)),
    nics: parseNics(xml),
    hostdevs: parseHostdevs(xml),
    dirs: parseDirs(xml),
    watchdog: parseWatchdog(xml),
  };
}
