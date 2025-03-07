export interface HostStats {
  cpu: {
    usage: number; // percentage
    cores: number;
    model: string;
  };
  memory: {
    total: number; // bytes
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
    mounts?: DiskMount[];
  };
  network: {
    rx: number; // bytes received
    tx: number; // bytes transmitted
    rx_rate: number; // bytes/sec
    tx_rate: number; // bytes/sec
  };
  uptime: number; // seconds
  os?: {
    platform: string;
    distro: string;
    release: string;
    kernel: string;
    arch: string;
  };
}

export interface DiskMount {
  fs: string;
  type: string;
  size: number;
  used: number;
  available: number;
  use: number; // percentage
  mount: string;
}

export interface ResourceTimeSeries {
  timestamp: number;
  value: number;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpu: number; // percentage
  memory: {
    usage: number; // bytes
    limit: number; // bytes
    percentage: number;
  };
  network: {
    rx: number;
    tx: number;
  };
  blockIO: {
    read: number;
    write: number;
  };
}

export interface VMStats {
  name: string;
  state: string;
  cpu: {
    usage: number; // percentage
    vcpus: number;
  };
  memory: {
    total: number; // KB
    used: number; // KB
    percentage: number;
  };
  disk: {
    read: number; // bytes
    write: number; // bytes
  };
  network: {
    rx: number; // bytes
    tx: number; // bytes
  };
}

export interface LiveStatsData {
  host: HostStats;
  containers: ContainerStats[];
  vms: VMStats[];
  timestamp: number;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface HealthIndicator {
  status: HealthStatus;
  issues: string[];
  metrics: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

export interface ActivityEvent {
  id: string;
  type: 'container' | 'vm' | 'system';
  action: 'created' | 'started' | 'stopped' | 'removed' | 'error' | 'warning';
  resource: string;
  message: string;
  timestamp: number;
  severity?: 'info' | 'warning' | 'error';
}

export interface Threshold {
  metric: 'cpu' | 'memory' | 'disk';
  value: number;
  duration?: number; // seconds
  severity: 'warning' | 'critical';
}
