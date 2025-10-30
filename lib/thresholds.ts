import type { HealthStatus, HealthIndicator, Threshold, HostStats, ContainerStats, VMStats } from '@/types/stats';

// Default thresholds
export const DEFAULT_THRESHOLDS: Threshold[] = [
  { metric: 'cpu', value: 90, severity: 'warning' },
  { metric: 'cpu', value: 95, severity: 'critical' },
  { metric: 'memory', value: 90, severity: 'warning' },
  { metric: 'memory', value: 95, severity: 'critical' },
  { metric: 'disk', value: 85, severity: 'warning' },
  { metric: 'disk', value: 90, severity: 'critical' },
];

export function checkHostThresholds(
  stats: HostStats,
  thresholds: Threshold[] = DEFAULT_THRESHOLDS
): { issues: string[]; status: HealthStatus } {
  const issues: string[] = [];
  let status: HealthStatus = 'healthy';

  // Check CPU
  const cpuWarning = thresholds.find((t) => t.metric === 'cpu' && t.severity === 'warning');
  const cpuCritical = thresholds.find((t) => t.metric === 'cpu' && t.severity === 'critical');

  if (cpuCritical && stats.cpu.usage >= cpuCritical.value) {
    issues.push(`CPU usage critical: ${stats.cpu.usage.toFixed(1)}%`);
    status = 'critical';
  } else if (cpuWarning && stats.cpu.usage >= cpuWarning.value) {
    issues.push(`CPU usage high: ${stats.cpu.usage.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Memory
  const memWarning = thresholds.find((t) => t.metric === 'memory' && t.severity === 'warning');
  const memCritical = thresholds.find((t) => t.metric === 'memory' && t.severity === 'critical');

  if (memCritical && stats.memory.percentage >= memCritical.value) {
    issues.push(`Memory usage critical: ${stats.memory.percentage.toFixed(1)}%`);
    status = 'critical';
  } else if (memWarning && stats.memory.percentage >= memWarning.value) {
    issues.push(`Memory usage high: ${stats.memory.percentage.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Disk
  const diskWarning = thresholds.find((t) => t.metric === 'disk' && t.severity === 'warning');
  const diskCritical = thresholds.find((t) => t.metric === 'disk' && t.severity === 'critical');

  if (diskCritical && stats.disk.percentage >= diskCritical.value) {
    issues.push(`Disk usage critical: ${stats.disk.percentage.toFixed(1)}%`);
    status = 'critical';
  } else if (diskWarning && stats.disk.percentage >= diskWarning.value) {
    issues.push(`Disk usage high: ${stats.disk.percentage.toFixed(1)}%`);
    if (status === 'healthy') status = 'warning';
  }

  return { issues, status };
}

export function checkContainerThresholds(
  container: ContainerStats
): { issues: string[]; status: HealthStatus } {
  const issues: string[] = [];
  let status: HealthStatus = 'healthy';

  // Check CPU
  if (container.cpu >= 95) {
    issues.push(`${container.name}: CPU critical (${container.cpu.toFixed(1)}%)`);
    status = 'critical';
  } else if (container.cpu >= 80) {
    issues.push(`${container.name}: CPU high (${container.cpu.toFixed(1)}%)`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Memory
  if (container.memory.percentage >= 95) {
    issues.push(`${container.name}: Memory critical (${container.memory.percentage.toFixed(1)}%)`);
    status = 'critical';
  } else if (container.memory.percentage >= 90) {
    issues.push(`${container.name}: Memory high (${container.memory.percentage.toFixed(1)}%)`);
    if (status === 'healthy') status = 'warning';
  }

  return { issues, status };
}

export function checkVMThresholds(
  vm: VMStats
): { issues: string[]; status: HealthStatus } {
  const issues: string[] = [];
  let status: HealthStatus = 'healthy';

  // Check CPU
  if (vm.cpu.usage >= 95) {
    issues.push(`${vm.name}: CPU critical (${vm.cpu.usage.toFixed(1)}%)`);
    status = 'critical';
  } else if (vm.cpu.usage >= 80) {
    issues.push(`${vm.name}: CPU high (${vm.cpu.usage.toFixed(1)}%)`);
    if (status === 'healthy') status = 'warning';
  }

  // Check Memory
  if (vm.memory.percentage >= 95) {
    issues.push(`${vm.name}: Memory critical (${vm.memory.percentage.toFixed(1)}%)`);
    status = 'critical';
  } else if (vm.memory.percentage >= 90) {
    issues.push(`${vm.name}: Memory high (${vm.memory.percentage.toFixed(1)}%)`);
    if (status === 'healthy') status = 'warning';
  }

  return { issues, status };
}

export function getSystemHealth(
  hostStats: HostStats,
  containerStats: ContainerStats[],
  vmStats: VMStats[]
): HealthIndicator {
  const allIssues: string[] = [];
  let worstStatus: HealthStatus = 'healthy';

  // Check host
  const hostCheck = checkHostThresholds(hostStats);
  allIssues.push(...hostCheck.issues);
  if (hostCheck.status === 'critical') {
    worstStatus = 'critical';
  } else if (hostCheck.status === 'warning' && worstStatus === 'healthy') {
    worstStatus = 'warning';
  }

  // Check containers
  containerStats.forEach((container) => {
    const containerCheck = checkContainerThresholds(container);
    allIssues.push(...containerCheck.issues);
    if (containerCheck.status === 'critical') {
      worstStatus = 'critical';
    } else if (containerCheck.status === 'warning' && worstStatus === 'healthy') {
      worstStatus = 'warning';
    }
  });

  // Check VMs
  vmStats.forEach((vm) => {
    const vmCheck = checkVMThresholds(vm);
    allIssues.push(...vmCheck.issues);
    if (vmCheck.status === 'critical') {
      worstStatus = 'critical';
    } else if (vmCheck.status === 'warning' && worstStatus === 'healthy') {
      worstStatus = 'warning';
    }
  });

  return {
    status: worstStatus,
    issues: allIssues,
    metrics: {
      cpu: hostStats.cpu.usage,
      memory: hostStats.memory.percentage,
      disk: hostStats.disk.percentage,
    },
  };
}

export function getThresholdColor(value: number, metric: 'cpu' | 'memory' | 'disk'): string {
  const thresholds = DEFAULT_THRESHOLDS.filter((t) => t.metric === metric);
  const critical = thresholds.find((t) => t.severity === 'critical');
  const warning = thresholds.find((t) => t.severity === 'warning');

  if (critical && value >= critical.value) {
    return 'text-red-600 dark:text-red-400';
  } else if (warning && value >= warning.value) {
    return 'text-yellow-600 dark:text-yellow-400';
  }
  return 'text-green-600 dark:text-green-400';
}

export function getProgressColor(value: number): string {
  if (value >= 95) {
    return 'bg-red-600';
  } else if (value >= 80) {
    return 'bg-yellow-600';
  }
  return 'bg-green-600';
}
