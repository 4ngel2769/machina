export type VMStatus = 'running' | 'paused' | 'shut off' | 'crashed' | 'pmsuspended' | 'stopped' | 'suspended';

export interface DisplayConfig {
  type: 'vnc' | 'spice' | 'none';
  port: number;
  listen: string;
  autoport: boolean;
}

export interface VirtualMachine {
  id: string;
  name: string;
  status: VMStatus;
  os_variant?: string;
  memory: number; // MB
  vcpus: number;
  disk_size: number; // GB
  created: Date;
  uptime?: string;
  cpu_usage?: number;
  memory_usage?: number;
  disk?: DiskInfo[];
  networks?: NetworkInterface[];
  stats?: VMStats;
  display?: DisplayConfig; // VNC/SPICE display configuration
  createdBy?: string; // User ID of the creator
}

// Alias for backward compatibility
export type VM = VirtualMachine;

export interface StoragePool {
  name: string;
  type: string; // 'dir', 'disk', 'logical', etc.
  path: string;
  capacity: number; // bytes
  allocation: number; // bytes
  available: number; // bytes
  state: 'active' | 'inactive';
}

export interface VirtualNetwork {
  name: string;
  state: 'active' | 'inactive';
  autostart: boolean;
  bridge?: string;
  mode: 'nat' | 'bridge' | 'isolated';
  ip_range?: string;
  dhcp_enabled: boolean;
}

export interface CreateVMRequest {
  name?: string; // Auto-generate if empty
  installation_medium: {
    type: 'download' | 'local' | 'url' | 'pxe';
    source?: string; // ISO path or URL
    os_variant?: string; // e.g., 'ubuntu24.04', 'debian12'
  };
  storage: {
    pool: string;
    size: number; // GB
    format: 'qcow2' | 'raw';
  };
  memory: number; // GB
  vcpus: number;
  network: {
    type: 'existing' | 'new';
    network_name?: string; // If existing
    new_network_config?: Partial<VirtualNetwork>; // If new
  };
}

export interface DiskInfo {
  path: string;
  size: number; // in GB
  format: 'qcow2' | 'raw' | 'vmdk' | 'vdi';
  device: 'disk' | 'cdrom';
}

export interface NetworkInterface {
  type: 'bridge' | 'nat' | 'host';
  mac: string;
  ip?: string;
  bridge?: string;
}

export interface VMStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryPercent: number;
  diskRead: number;
  diskWrite: number;
  networkRx: number;
  networkTx: number;
}

export interface VMCreateOptions {
  name: string;
  memory: number;
  vcpus: number;
  disk_size: number;
  os_variant: string;
  iso_path?: string;
  network_type: 'bridge' | 'nat' | 'host';
  disk_format?: 'qcow2' | 'raw';
}

export interface OSImage {
  id: string;
  name: string;
  variant: string;
  version: string;
  architecture: 'x86_64' | 'aarch64';
  minMemory: number;
  minDisk: number;
  downloadUrl?: string;
}
