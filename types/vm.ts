export interface VirtualMachine {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'suspended';
  memory: number; // in MB
  vcpus: number;
  disk: DiskInfo[];
  os_variant: string;
  created: Date;
  stats?: VMStats;
  networks?: NetworkInterface[];
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
