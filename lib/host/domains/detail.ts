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
  const boot = [...os.matchAll(/<boot\b[^>]*dev='([^']*)'/g)].map((match) => match[1]);
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
  const spiceBlock = elems(xml, 'graphics').find((graphicsXml) => /type='spice'/.test(graphicsXml)) ?? '';
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
  return elems(xml, 'disk').map((diskXml) => ({
    target: attr(diskXml, 'target', 'dev') ?? '',
    bus: attr(diskXml, 'target', 'bus') ?? '',
    device: attr(diskXml, 'disk', 'device') ?? 'disk',
    source: attr(diskXml, 'source', 'file') ?? attr(diskXml, 'source', 'dev') ?? '',
    format: attr(diskXml, 'driver', 'type') ?? '',
    sizeGb: null,
  }));
}

/** Best-effort size, kept null when a foreign disk is unreadable for us. */
async function withDiskSizes(disks: VmDisk[]): Promise<VmDisk[]> {
  for (const disk of disks) {
    if (disk.device !== 'disk' || !disk.source || !disk.source.startsWith('/')) continue;
    try {
      const info = JSON.parse(await run('qemu-img', ['info', '--output=json', '-U', disk.source], { sudo: true }));
      disk.sizeGb = Math.round((Number(info['virtual-size']) || 0) / 10 ** 9);
    } catch { /* keep null */ }
  }
  return disks;
}

function parseNics(xml: string): VmNic[] {
  return elems(xml, 'interface').map((ifaceXml) => ({
    mac: attr(ifaceXml, 'mac', 'address') ?? '',
    type: attr(ifaceXml, 'interface', 'type') ?? 'network',
    source: attr(ifaceXml, 'source', 'network') ?? attr(ifaceXml, 'source', 'bridge') ?? attr(ifaceXml, 'source', 'dev') ?? '',
    model: attr(ifaceXml, 'model', 'type') ?? '',
  }));
}

function hostdevLabel(kind: string, vendor: string, product: string, bus: string, slot: string): string {
  if (kind === 'usb') return `usb ${vendor || '?'}:${product || '?'}`;
  return `pci ${bus}:${slot}`.trim();
}

function parseHostdevs(xml: string): VmHostdev[] {
  return elems(xml, 'hostdev').map((hostdevXml) => {
    const vendor = attr(hostdevXml, 'vendor', 'id') ?? '';
    const product = attr(hostdevXml, 'product', 'id') ?? '';
    const bus = attr(hostdevXml, 'address', 'bus') ?? '';
    const slot = attr(hostdevXml, 'address', 'slot') ?? '';
    const kind = attr(hostdevXml, 'hostdev', 'type') ?? 'pci';
    return { kind, label: hostdevLabel(kind, vendor, product, bus, slot), xml: hostdevXml };
  });
}

function parseDirs(xml: string): VmDir[] {
  return elems(xml, 'filesystem').map((fsXml) => ({
    source: attr(fsXml, 'source', 'dir') ?? '',
    target: attr(fsXml, 'target', 'dir') ?? '',
    readonly: /<readonly\/>/.test(fsXml),
  }));
}

function parseWatchdog(xml: string): VmDetail['watchdog'] {
  const watchdogXml = elems(xml, 'watchdog')[0];
  if (!watchdogXml) return null;
  return {
    model: attr(watchdogXml, 'watchdog', 'model') ?? 'i6300esb',
    action: attr(watchdogXml, 'watchdog', 'action') ?? 'reset',
  };
}

export async function vmDetail(name: string): Promise<VmDetail> {
  assertName(name);
  const [summary] = (await listVms()).filter((vm) => vm.name === name);
  if (!summary) throw new Error('domain not found');
  const xml = await loadXml(name);
  return {
    ...summary,
    ...parseOs(xml),
    ...parseCpu(xml, summary.vcpu),
    ...parseGraphics(xml),
    disks: await withDiskSizes(parseDisks(xml)),
    nics: parseNics(xml),
    hostdevs: parseHostdevs(xml),
    dirs: parseDirs(xml),
    watchdog: parseWatchdog(xml),
  };
}
