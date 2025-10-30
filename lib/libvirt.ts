import { execSync } from 'child_process';
import { VirtualMachine, VMStatus, StoragePool, VirtualNetwork } from '@/types/vm';
import path from 'path';

// Security: Maximum resource limits per VM
const MAX_VM_MEMORY = 32 * 1024; // 32GB in MB
const MAX_VM_VCPUS = 16;
const MAX_VM_DISK = 500 * 1024; // 500GB in MB

// Security: Allowed ISO/image directories
const ALLOWED_ISO_PATHS = [
  '/var/lib/libvirt/images',
  '/var/lib/libvirt/boot',
  '/home',
  'C:\\Users',
  'C:\\libvirt\\images',
];

/**
 * Validate VM name (prevent command injection)
 */
function validateVMName(name: string): void {
  // Only allow alphanumeric, hyphens, and underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(name)) {
    throw new Error('Invalid VM name. Use only alphanumeric characters, hyphens, and underscores.');
  }
  if (name.length === 0 || name.length > 255) {
    throw new Error('VM name must be between 1 and 255 characters.');
  }
}

/**
 * Validate ISO path (prevent path traversal)
 */
function validateISOPath(isoPath: string): void {
  // Normalize path
  const normalizedPath = path.normalize(isoPath);
  
  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    throw new Error('Invalid ISO path: path traversal detected');
  }
  
  // Validate against whitelist
  const isAllowed = ALLOWED_ISO_PATHS.some(allowedPath => {
    const normalizedAllowed = path.normalize(allowedPath);
    return normalizedPath.startsWith(normalizedAllowed);
  });
  
  if (!isAllowed) {
    throw new Error(`ISO path not allowed. Must be in: ${ALLOWED_ISO_PATHS.join(', ')}`);
  }
}

/**
 * Validate VM resources (prevent resource exhaustion)
 */
function validateVMResources(memory: number, vcpus: number, diskSize: number): void {
  if (memory > MAX_VM_MEMORY) {
    throw new Error(`Memory exceeds maximum allowed: ${MAX_VM_MEMORY}MB`);
  }
  if (memory < 512) {
    throw new Error('Memory must be at least 512MB');
  }
  
  if (vcpus > MAX_VM_VCPUS) {
    throw new Error(`vCPUs exceed maximum allowed: ${MAX_VM_VCPUS}`);
  }
  if (vcpus < 1) {
    throw new Error('vCPUs must be at least 1');
  }
  
  if (diskSize > MAX_VM_DISK) {
    throw new Error(`Disk size exceeds maximum allowed: ${MAX_VM_DISK}MB`);
  }
  if (diskSize < 1024) {
    throw new Error('Disk size must be at least 1GB (1024MB)');
  }
}

/**
 * Sanitize virsh command arguments (prevent injection)
 */
function sanitizeArgs(args: string[]): string[] {
  return args.map(arg => {
    // Remove any dangerous characters
    const sanitized = arg.replace(/[;&|`$(){}[\]<>]/g, '');
    return sanitized;
  });
}

/**
 * Execute virsh command and return output
 */
function execVirsh(args: string[]): string {
  try {
    // Security: Sanitize arguments
    const sanitizedArgs = sanitizeArgs(args);
    
    const command = `virsh ${sanitizedArgs.join(' ')}`;
    console.log(`[libvirt] Executing: ${command}`);
    
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    
    console.log(`[libvirt] Output: ${output.substring(0, 200)}${output.length > 200 ? '...' : ''}`);
    return output;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[libvirt] Error executing virsh: ${errorMessage}`);
    throw new Error(`Virsh command failed: ${errorMessage}`);
  }
}

/**
 * Check if libvirt is available
 */
export function isLibvirtAvailable(): boolean {
  try {
    execVirsh(['--version']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to libvirt (validate connection)
 */
export function connectToLibVirt(): boolean {
  try {
    execVirsh(['version']);
    return true;
  } catch (error) {
    console.error('Failed to connect to libvirt:', error);
    return false;
  }
}

/**
 * List all VMs
 */
export function listVMs(): VirtualMachine[] {
  try {
    // Get list of all VMs (running and shut off)
    const output = execVirsh(['list', '--all']);
    
    const vms: VirtualMachine[] = [];
    const lines = output.split('\n').slice(2); // Skip header lines
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Parse line format: " Id   Name    State"
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;
      
      const id = parts[0] === '-' ? '' : parts[0];
      const name = parts[1];
      const state = parts.slice(2).join(' '); // State can be multiple words
      
      // Get VM details
      const details = getVMDetails(name);
      
      vms.push({
        id: id || name,
        name,
        status: mapVMStatus(state),
        os_variant: details.os_variant || 'generic',
        memory: details.memory || 0,
        vcpus: details.vcpus || 0,
        disk_size: details.disk_size || 0,
        created: details.created || new Date(),
      });
    }
    
    return vms;
  } catch (error) {
    console.error('Error listing VMs:', error);
    throw new Error(`Failed to list VMs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Map virsh status to VMStatus type
 */
function mapVMStatus(state: string): VMStatus {
  const lowerState = state.toLowerCase();
  if (lowerState.includes('running')) return 'running';
  if (lowerState.includes('paused')) return 'paused';
  if (lowerState.includes('shut off') || lowerState.includes('shut down')) return 'shut off';
  if (lowerState.includes('crashed')) return 'crashed';
  if (lowerState.includes('pmsuspended')) return 'pmsuspended';
  if (lowerState.includes('suspended')) return 'paused';
  if (lowerState.includes('stopped')) return 'shut off';
  return 'shut off';
}

/**
 * Get VM details
 */
export function getVMDetails(name: string): Partial<VirtualMachine> {
  try {
    const output = execVirsh(['dominfo', name]);
    
    const details: Partial<VirtualMachine> = {
      memory: 0,
      vcpus: 0,
      disk_size: 0,
      created: new Date(),
    };
    
    const lines = output.split('\n');
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (key.includes('Max memory')) {
        // Memory is in KiB, convert to MB
        details.memory = Math.floor(parseInt(value) / 1024);
      } else if (key.includes('CPU(s)')) {
        details.vcpus = parseInt(value);
      }
    }
    
    return details;
  } catch (error) {
    console.error(`Error getting VM details for ${name}:`, error);
    return {};
  }
}

/**
 * Get VM information (alias for getVMDetails)
 */
export function getVMInfo(vmName: string): Partial<VirtualMachine> {
  return getVMDetails(vmName);
}

/**
 * Start a VM
 */
export function startVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['start', name]);
    return { success: true, message: `VM ${name} started successfully` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start VM ${name}: ${errorMessage}`);
  }
}

/**
 * Stop VM gracefully (shutdown)
 */
export function stopVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['shutdown', name]);
    return { success: true, message: `VM ${name} shutdown initiated` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to stop VM ${name}: ${errorMessage}`);
  }
}

/**
 * Force stop VM (destroy)
 */
export function forceStopVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['destroy', name]);
    return { success: true, message: `VM ${name} forcefully stopped` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to force stop VM ${name}: ${errorMessage}`);
  }
}

/**
 * Pause/suspend VM
 */
export function pauseVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['suspend', name]);
    return { success: true, message: `VM ${name} paused` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to pause VM ${name}: ${errorMessage}`);
  }
}

/**
 * Resume paused VM
 */
export function resumeVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['resume', name]);
    return { success: true, message: `VM ${name} resumed` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resume VM ${name}: ${errorMessage}`);
  }
}

/**
 * Delete VM (undefine with storage removal)
 */
export function deleteVM(name: string): { success: boolean; message: string } {
  try {
    // Security: Validate VM name
    validateVMName(name);
    
    execVirsh(['undefine', name, '--remove-all-storage']);
    return { success: true, message: `VM ${name} deleted` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to delete VM ${name}: ${errorMessage}`);
  }
}

/**
 * Create a VM with security validations
 */
export function createVM(options: {
  name: string;
  memory: number;
  vcpus: number;
  disk_size: number;
  iso_path?: string;
  [key: string]: unknown;
}): { success: boolean; message: string; name?: string } {
  try {
    // Security: Validate VM name
    validateVMName(options.name);
    
    // Security: Validate resources
    validateVMResources(options.memory, options.vcpus, options.disk_size);
    
    // Security: Validate ISO path if provided
    if (options.iso_path) {
      validateISOPath(options.iso_path);
    }
    
    // This is a placeholder - actual implementation will use virt-install
    // which will be called from the API route
    console.log('Create VM called with validated options:', options);
    return { success: true, message: 'VM creation initiated', name: options.name };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create VM: ${errorMessage}`);
  }
}

/**
 * List storage pools
 */
export function listStoragePools(): StoragePool[] {
  try {
    const output = execVirsh(['pool-list', '--all', '--details']);
    
    const pools: StoragePool[] = [];
    const lines = output.split('\n').slice(2); // Skip headers
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(/\s+/);
      if (parts.length < 6) continue;
      
      const name = parts[0];
      const state = parts[1].toLowerCase() as 'active' | 'inactive';
      
      // Get pool details
      try {
        const poolInfo = execVirsh(['pool-info', name]);
        const poolDetails = parsePoolInfo(poolInfo);
        
        pools.push({
          name,
          type: poolDetails.type || 'dir',
          path: poolDetails.path || '',
          capacity: poolDetails.capacity || 0,
          allocation: poolDetails.allocation || 0,
          available: poolDetails.available || 0,
          state,
        });
      } catch {
        // Skip pools that can't be queried
        continue;
      }
    }
    
    return pools;
  } catch (error) {
    console.error('Error listing storage pools:', error);
    throw new Error(`Failed to list storage pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse pool-info output
 */
function parsePoolInfo(output: string): Partial<StoragePool> {
  const details: Partial<StoragePool> = {};
  const lines = output.split('\n');
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    
    if (key.includes('Type')) {
      details.type = value;
    } else if (key.includes('Capacity')) {
      details.capacity = parseBytes(value);
    } else if (key.includes('Allocation')) {
      details.allocation = parseBytes(value);
    } else if (key.includes('Available')) {
      details.available = parseBytes(value);
    }
  }
  
  return details;
}

/**
 * Parse byte values from virsh output (e.g., "10.00 GiB")
 */
function parseBytes(value: string): number {
  const match = value.match(/([\d.]+)\s*([KMGT]i?B?)/i);
  if (!match) return 0;
  
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers: Record<string, number> = {
    'B': 1,
    'KB': 1000,
    'KIB': 1024,
    'MB': 1000000,
    'MIB': 1048576,
    'GB': 1000000000,
    'GIB': 1073741824,
    'TB': 1000000000000,
    'TIB': 1099511627776,
  };
  
  return Math.floor(num * (multipliers[unit] || 1));
}

/**
 * List virtual networks
 */
export function listNetworks(): VirtualNetwork[] {
  try {
    const output = execVirsh(['net-list', '--all']);
    
    const networks: VirtualNetwork[] = [];
    const lines = output.split('\n').slice(2); // Skip headers
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) continue;
      
      const name = parts[0];
      const state = parts[1].toLowerCase() as 'active' | 'inactive';
      const autostart = parts[2].toLowerCase() === 'yes';
      
      networks.push({
        name,
        state,
        autostart,
        mode: 'nat', // Default, would need to parse network XML for accurate info
        dhcp_enabled: true,
      });
    }
    
    return networks;
  } catch (error) {
    console.error('Error listing networks:', error);
    throw new Error(`Failed to list networks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get VM resource statistics
 */
export function getVMStats(name: string): { cpu_usage?: number; memory_usage?: number } {
  try {
    // This would require parsing 'virsh domstats' output
    // For now, return placeholder
    return {
      cpu_usage: 0,
      memory_usage: 0,
    };
  } catch (error) {
    console.error(`Error getting stats for VM ${name}:`, error);
    return {};
  }
}

/**
 * Get VM display configuration (VNC/SPICE)
 */
export function getVMDisplayConfig(name: string): { vnc?: { port: number; listen: string }; spice?: { port: number; listen: string } } | null {
  try {
    const xml = execVirsh(['dumpxml', name]);
    const displayConfig: { vnc?: { port: number; listen: string }; spice?: { port: number; listen: string } } = {};
    
    // Parse VNC configuration
    const vncMatch = xml.match(/<graphics type='vnc'[^>]*port='(\d+)'[^>]*listen='([^']*)'[^>]*>/);
    if (vncMatch) {
      displayConfig.vnc = {
        port: parseInt(vncMatch[1]),
        listen: vncMatch[2],
      };
    }
    
    // Parse SPICE configuration
    const spiceMatch = xml.match(/<graphics type='spice'[^>]*port='(\d+)'[^>]*listen='([^']*)'[^>]*>/);
    if (spiceMatch) {
      displayConfig.spice = {
        port: parseInt(spiceMatch[1]),
        listen: spiceMatch[2],
      };
    }
    
    return Object.keys(displayConfig).length > 0 ? displayConfig : null;
  } catch (error) {
    console.error(`Error getting display config for VM ${name}:`, error);
    return null;
  }
}
