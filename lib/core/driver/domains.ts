/**
 * Domain lifecycle: list, query state, build the XML, define, start, stop,
 * resume, destroy and resize. Everything here talks to libvirt in one call.
 */
import fs from 'fs/promises';
import { storagePaths, config } from '@/lib/config';
import { virsh } from './exec';
import { ignore } from '@/lib/core/ignore';

export interface DomInfo {
  name: string;
  state: string;
  uuid: string;
}

export async function listDomains(): Promise<DomInfo[]> {
  const out = await virsh(['list', '--all']);
  const rows: DomInfo[] = [];
  for (const line of out.split('\n').slice(2)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const fields = trimmed.split(/\s+/);
    if (fields.length < 3) continue;
    const name = fields[1];
    const state = fields.slice(2).join(' ');
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

export async function vmGenIdNameList(): Promise<string[]> {
  const doms = await listDomains();
  return doms.filter((domain) => domain.name.startsWith(config.domainPrefix)).map((domain) => domain.name);
}

/** True only when libvirt reports the domain running. A destroyed domain is
 *  NOT running, which is what makes --atomic safe for snapshots. */
export async function isDomainRunning(domainName: string): Promise<boolean> {
  try {
    return await domState(domainName) === 'running';
  } catch {
    return false;
  }
}

export interface DomainXmlOptions {
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
  spice?: boolean;
  serialPath: string;
  /** libvirt network the NIC attaches to; defaults to the shared machina0. */
  network?: string;
}

/** Identity, resources, machine type and power policy: no devices. */
function domainCoreXml(opts: DomainXmlOptions): string {
  const { domainName, instanceId, vcpu, ramMb } = opts;
  return `  <name>${domainName}</name>
  <memory unit='MiB'>${ramMb}</memory>
  <currentMemory unit='MiB'>${ramMb}</currentMemory>
  <vcpu placement='static'>${vcpu}</vcpu>
  <metadata>
    <machina:instance xmlns:machina='https://machina.local/xmlns/machina/1.0'>${instanceId}</machina:instance>
  </metadata>
  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <boot dev='hd'/>
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
`;
}

/** Data disk plus the read-only cloud-init seed. */
function domainStorageXml(opts: DomainXmlOptions): string {
  const { diskVolPath, seedIsoPath } = opts;
  return `    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2' discard='unmap'/>
      <source file='${diskVolPath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <!-- cloud-init seed. A SATA cdrom is NOT reliable here: the cloud-init
         systemd generator (ds-identify) probes block devices to decide whether
         a datasource exists, and at generator time the AHCI/sr_mod stack has
         not necessarily produced /dev/sda yet. When the probe misses, the
         generator decides "no datasource" and never pulls cloud-init.target
         in, so the guest boots with the image's default hostname, no network
         config and no root password - and provisioning times out on SSH with
         nothing on the console to show for it. virtio-blk is claimed by the
         kernel itself and is visible before the generators run. -->
    <disk type='file' device='disk'>
      <driver name='qemu' type='raw'/>
      <source file='${seedIsoPath}'/>
      <target dev='vdb' bus='virtio'/>
      <readonly/>
    </disk>
`;
}

/** Network, serial console and entropy. */
function domainTransportXml(opts: DomainXmlOptions): string {
  const { mac, serialPath } = opts;
  return `    <interface type='network'>
      <mac address='${mac}'/>
      <source network='${opts.network ?? config.network}'/>
      <model type='virtio'/>
    </interface>
    <serial type='file'>
      <source path='${serialPath}'/>
      <target port='0'/>
    </serial>
    <rng model='virtio'>
      <backend model='random'>/dev/urandom</backend>
    </rng>
`;
}

/** Display surfaces and the input/balloon devices QEMU expects. */
function domainDisplayXml(opts: DomainXmlOptions): string {
  const { vncSocket, vncPass } = opts;
  // SPICE is additive: the in-app console speaks VNC over our websocket relay,
  // and SPICE exists for native clients (remote-viewer) on loopback only.
  const spice = opts.spice
    ? `\n    <graphics type='spice' autoport='yes' listen='127.0.0.1'><listen type='address' address='127.0.0.1'/></graphics>`
    : '';
  return `    <console type='pty'/>
    <graphics type='vnc' socket='${vncSocket}' passwd='${vncPass}'/>${spice}
    <video>
      <model type='virtio'/>
    </video>
    <input type='tablet' bus='usb'/>
    <memballoon model='virtio'/>
`;
}

/** Disks, network, serial, console and graphics, wrapped in <devices>. */
function domainDevicesXml(opts: DomainXmlOptions): string {
  return `  <devices>
${domainStorageXml(opts)}${domainTransportXml(opts)}${domainDisplayXml(opts)}  </devices>
`;
}

export function domainXml(opts: DomainXmlOptions): string {
  return `<?xml version="1.0"?>
<domain type='kvm'>
${domainCoreXml(opts)}${domainDevicesXml(opts)}</domain>`;
}

export async function defineDomain(xml: string): Promise<void> {
  const xmlPath = `${storagePaths().tmp}/define-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xml`;
  await fs.writeFile(xmlPath, xml);
  try {
    await virsh(['define', xmlPath]);
  } finally {
    await fs.rm(xmlPath, { force: true }).catch(ignore('temp XML may not exist'));
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
  const state = await domState(name);
  if (state && /running/i.test(state) && !/paused/i.test(state)) return; // already there
  if (state && /paused/i.test(state)) {
    await resumeDomain(name);
    return;
  }
  await startDomain(name);
}

export async function destroyDomain(name: string): Promise<void> {
  await virsh(['destroy', name]).catch(ignore('domain may already be gone'));
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
