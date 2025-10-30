import { execSync } from 'child_process';

/**
 * Generate a random VM name
 */
export function generateVMName(osVariant?: string): string {
  const prefix = osVariant ? osVariant.split(/[0-9]/)[0] : 'vm';
  const random = Math.random().toString(36).substring(2, 6);
  return `vm-${prefix}-${random}`;
}

/**
 * Format bytes to human-readable format (GB, MB, etc.)
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Parse VM uptime from seconds to human-readable format
 */
export function parseVMUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Get available OS variants from osinfo-query
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
 * Validate IP range format (e.g., "192.168.122.0/24")
 */
export function validateIPRange(ipRange: string): boolean {
  // Simple regex for IP/CIDR notation
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!ipRegex.test(ipRange)) return false;
  
  const [ip, cidr] = ipRange.split('/');
  const octets = ip.split('.');
  
  // Validate each octet is 0-255
  for (const octet of octets) {
    const num = parseInt(octet);
    if (num < 0 || num > 255) return false;
  }
  
  // Validate CIDR is 0-32
  const cidrNum = parseInt(cidr);
  if (cidrNum < 0 || cidrNum > 32) return false;
  
  return true;
}

/**
 * Generate libvirt domain XML for VM creation
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
    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'>
      <listen type='address' address='127.0.0.1'/>
    </graphics>
    <video>
      <model type='qxl' vram='16384'/>
    </video>
  </devices>
</domain>
`.trim();
}

/**
 * Validate VM name (alphanumeric, hyphens, underscores only)
 */
export function validateVMName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Parse virsh uptime output
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

/**
 * Convert GB to bytes
 */
export function gbToBytes(gb: number): number {
  return gb * 1024 * 1024 * 1024;
}

/**
 * Convert bytes to GB
 */
export function bytesToGb(bytes: number): number {
  return bytes / 1024 / 1024 / 1024;
}

/**
 * Get disk format from filename
 */
export function getDiskFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'qcow2':
      return 'qcow2';
    case 'raw':
      return 'raw';
    case 'vmdk':
      return 'vmdk';
    case 'vdi':
      return 'vdi';
    default:
      return 'qcow2'; // default
  }
}
