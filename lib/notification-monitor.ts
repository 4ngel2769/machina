/**
 * Notification Monitor for Resource Thresholds
 * 
 * Monitors resource usage and triggers notifications when thresholds are exceeded.
 * Uses a cooldown mechanism to prevent notification spam.
 */

import { toast } from 'sonner';
import type { LiveStatsData, ContainerStats, VMStats } from '@/types/stats';
import { checkHostThresholds, checkContainerThresholds, checkVMThresholds } from '@/lib/thresholds';

// Cooldown tracker to prevent notification spam (5 minutes)
const COOLDOWN_MS = 5 * 60 * 1000;
const notificationCooldowns = new Map<string, number>();

function canNotify(key: string): boolean {
  const lastNotification = notificationCooldowns.get(key);
  if (!lastNotification) return true;
  
  const now = Date.now();
  if (now - lastNotification > COOLDOWN_MS) {
    return true;
  }
  
  return false;
}

function recordNotification(key: string): void {
  notificationCooldowns.set(key, Date.now());
}

/**
 * Monitor host system thresholds and trigger notifications
 */
export function monitorHostThresholds(stats: LiveStatsData['host']): void {
  const { issues, status } = checkHostThresholds(stats);
  
  if (issues.length === 0 || status === 'healthy') return;
  
  const key = `host-system`;
  if (!canNotify(key)) return;
  
  if (status === 'critical') {
    toast.error('Host System Critical', {
      description: issues.join(', '),
      duration: 10000,
    });
    recordNotification(key);
  } else if (status === 'warning') {
    toast.warning('Host System Warning', {
      description: issues.join(', '),
      duration: 7000,
    });
    recordNotification(key);
  }
}

/**
 * Monitor container thresholds and trigger notifications
 */
export function monitorContainerThresholds(containers: ContainerStats[]): void {
  for (const container of containers) {
    const { issues, status } = checkContainerThresholds(container);
    
    if (issues.length === 0 || status === 'healthy') continue;
    
    const key = `container-${container.id}`;
    if (!canNotify(key)) continue;
    
    if (status === 'critical') {
      toast.error(`Container "${container.name}" Critical`, {
        description: issues.join(', '),
        duration: 10000,
      });
      recordNotification(key);
    } else if (status === 'warning') {
      toast.warning(`Container "${container.name}" Warning`, {
        description: issues.join(', '),
        duration: 7000,
      });
      recordNotification(key);
    }
  }
}

/**
 * Monitor VM thresholds and trigger notifications
 */
export function monitorVMThresholds(vms: VMStats[]): void {
  for (const vm of vms) {
    const { issues, status } = checkVMThresholds(vm);
    
    if (issues.length === 0 || status === 'healthy') continue;
    
    const key = `vm-${vm.name}`;
    if (!canNotify(key)) continue;
    
    if (status === 'critical') {
      toast.error(`VM "${vm.name}" Critical`, {
        description: issues.join(', '),
        duration: 10000,
      });
      recordNotification(key);
    } else if (status === 'warning') {
      toast.warning(`VM "${vm.name}" Warning`, {
        description: issues.join(', '),
        duration: 7000,
      });
      recordNotification(key);
    }
  }
}

/**
 * Monitor all stats and trigger notifications as needed
 */
export function monitorAllThresholds(stats: LiveStatsData | null): void {
  if (!stats) return;
  
  // Monitor host
  if (stats.host) {
    monitorHostThresholds(stats.host);
  }
  
  // Monitor containers
  if (stats.containers && stats.containers.length > 0) {
    monitorContainerThresholds(stats.containers);
  }
  
  // Monitor VMs
  if (stats.vms && stats.vms.length > 0) {
    monitorVMThresholds(stats.vms);
  }
}

/**
 * Clear all notification cooldowns (useful for testing or manual reset)
 */
export function clearNotificationCooldowns(): void {
  notificationCooldowns.clear();
}
