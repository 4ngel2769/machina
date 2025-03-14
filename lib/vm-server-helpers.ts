import { execSync } from 'child_process';

/**
 * Get available OS variants from osinfo-query
 * Server-side only function
 */
export function getOSVariants(): string[] {
  try {
    const output = execSync('osinfo-query os --fields=short-id', {
      encoding: 'utf-8',
    }).trim();
    
    const lines = output.split('\n').slice(2); // Skip headers
    return lines
      .map(line => line.trim())
      .filter(line => line.length > 0);
  } catch {
    console.warn('osinfo-query not available, using fallback list');
    // Fallback list of common OS variants
    return [
      'ubuntu24.04', 'ubuntu22.04', 'ubuntu20.04',
      'debian12', 'debian11', 'debian10',
      'fedora41', 'fedora40', 'fedora39',
      'rhel9.3', 'rhel8.9',
      'centos9', 'centos8',
      'archlinux',
      'opensuse15.5',
      'win11', 'win10', 'win2k22', 'win2k19',
      'generic',
    ];
  }
}

/**
 * Generate a random VM name
 * Server-side only function
 */
export function generateVMName(osVariant?: string): string {
  const prefix = osVariant ? osVariant.split(/[0-9]/)[0] : 'vm';
  const random = Math.random().toString(36).substring(2, 6);
  return `vm-${prefix}-${random}`;
}

/**
 * Generate libvirt domain XML for VM creation
 * Server-side only function
 */
export function generateVMXML(options: {
  name: string;
  memory: number; // MB
  vcpus: number;
  diskPath: string;
  osVariant?: string;
  network?: string;
}): string {
  const {
    name,
    memory,
    vcpus,
    diskPath,
    network = 'default',
  } = options;
  
  return `
<domain type='kvm'>
  <name>${name}</name>
  <memory unit='MiB'>${memory}</memory>
  <vcpu>${vcpus}</vcpu>
  <os>
    <type arch='x86_64'>hvm</type>
    <boot dev='hd'/>
    <boot dev='cdrom'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <cpu mode='host-passthrough'/>
  <clock offset='utc'>
    <timer name='rtc' tickpolicy='catchup'/>
    <timer name='pit' tickpolicy='delay'/>
    <timer name='hpet' present='no'/>
  </clock>
  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='${diskPath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <source network='${network}'/>
      <model type='virtio'/>
    </interface>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <graphics type='vnc' port='-1' autoport='yes' listen='${process.env.VM_DISPLAY_LISTEN || '0.0.0.0'}'>
      <listen type='address' address='${process.env.VM_DISPLAY_LISTEN || '0.0.0.0'}'/>
    </graphics>
    <video>
      <model type='qxl' vram='16384'/>
    </video>
  </devices>
</domain>
`.trim();
}

/**
 * Parse virsh uptime output
 * Server-side only function
 */
export function parseVirshUptime(output: string): number {
  // Parse output like "2d 3h 45m 12s" to seconds
  let totalSeconds = 0;
  
  const days = output.match(/(\d+)d/);
  if (days) totalSeconds += parseInt(days[1]) * 86400;
  
  const hours = output.match(/(\d+)h/);
  if (hours) totalSeconds += parseInt(hours[1]) * 3600;
  
  const minutes = output.match(/(\d+)m/);
  if (minutes) totalSeconds += parseInt(minutes[1]) * 60;
  
  const seconds = output.match(/(\d+)s/);
  if (seconds) totalSeconds += parseInt(seconds[1]);
  
  return totalSeconds;
}
