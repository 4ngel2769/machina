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
 * Validate VM name (alphanumeric, hyphens, underscores only)
 */
export function validateVMName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
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
