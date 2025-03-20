export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'restarting' | 'removing' | 'exited' | 'created';

export type ContainerType = 'normal' | 'amnesic';

export interface Container {
  id: string;
  name: string;
  image: string;
  status: ContainerStatus;
  created: Date;
  ports: Array<{ container: number; host: number; protocol: string }>;
  type: ContainerType;
  uptime?: string;
  cpu?: number;
  memory?: number;
  state?: {
    startedAt?: Date;
    finishedAt?: Date;
    exitCode?: number;
  };
  stats?: ContainerStats;
  createdBy?: string; // User ID of the creator
}

export interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: 'tcp' | 'udp';
  ip?: string;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
}

export interface ContainerCreateOptions {
  name: string;
  image: string;
  env?: string[];
  ports?: Record<string, unknown>;
  volumes?: string[];
  command?: string[];
  restartPolicy?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
}

export interface CreateContainerRequest {
  name?: string;
  image: string;
  type: ContainerType;
  shell: string;
  ports?: Array<{ container: number; host: number; protocol: string }>;
  env?: Record<string, string>;
}
