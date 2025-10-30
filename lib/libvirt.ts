import { execSync } from 'child_process';
import { VirtualMachine, VMStatus, StoragePool, VirtualNetwork } from '@/types/vm';

/**
 * Execute virsh command and return output
 */
function execVirsh(args: string[]): string {
  try {
    const command = `virsh ${args.join(' ')}`;
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
    execVirsh(['undefine', name, '--remove-all-storage']);
    return { success: true, message: `VM ${name} deleted` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to delete VM ${name}: ${errorMessage}`);
  }
}

/**
 * Create a VM
 */
export function createVM(options: Record<string, unknown>): { success: boolean; message: string; name?: string } {
  try {
    // This is a placeholder - actual implementation will use virt-install
    // which will be called from the API route
    console.log('Create VM called with options:', options);
    return { success: true, message: 'VM creation initiated', name: options.name as string };
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
