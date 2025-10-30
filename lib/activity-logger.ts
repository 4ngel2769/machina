import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export type ActivityAction =
  | 'user.login'
  | 'user.logout'
  | 'user.created'
  | 'user.updated'
  | 'user.suspended'
  | 'user.activated'
  | 'user.deleted'
  | 'vm.created'
  | 'vm.started'
  | 'vm.stopped'
  | 'vm.deleted'
  | 'vm.cloned'
  | 'vm.snapshot.created'
  | 'vm.snapshot.restored'
  | 'vm.snapshot.deleted'
  | 'container.created'
  | 'container.started'
  | 'container.stopped'
  | 'container.deleted'
  | 'quota.updated'
  | 'tokens.added'
  | 'tokens.removed'
  | 'tokens.set'
  | 'plan.changed'
  | 'admin.action';

export interface ActivityLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: ActivityAction;
  resourceType?: 'vm' | 'container' | 'user' | 'quota' | 'tokens' | 'plan';
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

const LOGS_FILE = path.join(process.cwd(), 'data', 'activity-logs.json');
const MAX_LOGS = 10000; // Keep last 10k logs

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load logs from file
function loadLogs(): ActivityLog[] {
  ensureDataDir();
  
  if (!fs.existsSync(LOGS_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(LOGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading activity logs:', error);
    return [];
  }
}

// Save logs to file
function saveLogs(logs: ActivityLog[]): void {
  ensureDataDir();
  
  try {
    // Keep only the most recent logs
    const logsToSave = logs.slice(-MAX_LOGS);
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logsToSave, null, 2));
  } catch (error) {
    console.error('Error saving activity logs:', error);
  }
}

/**
 * Log an activity
 */
export function logActivity(params: {
  userId: string;
  username: string;
  action: ActivityAction;
  resourceType?: 'vm' | 'container' | 'user' | 'quota' | 'tokens' | 'plan';
  resourceId?: string;
  resourceName?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}): ActivityLog {
  const log: ActivityLog = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    userId: params.userId,
    username: params.username,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    resourceName: params.resourceName,
    details: params.details,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    success: params.success ?? true,
    errorMessage: params.errorMessage,
  };

  const logs = loadLogs();
  logs.push(log);
  saveLogs(logs);

  return log;
}

/**
 * Get all logs with optional filters
 */
export function getLogs(filters?: {
  userId?: string;
  action?: ActivityAction | ActivityAction[];
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): { logs: ActivityLog[]; total: number } {
  let logs = loadLogs();

  // Apply filters
  if (filters) {
    if (filters.userId) {
      logs = logs.filter(log => log.userId === filters.userId);
    }

    if (filters.action) {
      const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
      logs = logs.filter(log => actions.includes(log.action));
    }

    if (filters.resourceType) {
      logs = logs.filter(log => log.resourceType === filters.resourceType);
    }

    if (filters.startDate) {
      const startTime = filters.startDate.getTime();
      logs = logs.filter(log => new Date(log.timestamp).getTime() >= startTime);
    }

    if (filters.endDate) {
      const endTime = filters.endDate.getTime();
      logs = logs.filter(log => new Date(log.timestamp).getTime() <= endTime);
    }
  }

  // Sort by timestamp descending (newest first)
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = logs.length;

  // Apply pagination
  if (filters?.limit !== undefined) {
    const offset = filters.offset || 0;
    logs = logs.slice(offset, offset + filters.limit);
  }

  return { logs, total };
}

/**
 * Get logs for a specific user
 */
export function getUserLogs(userId: string, limit = 100): ActivityLog[] {
  const { logs } = getLogs({ userId, limit });
  return logs;
}

/**
 * Get recent logs
 */
export function getRecentLogs(limit = 100): ActivityLog[] {
  const { logs } = getLogs({ limit });
  return logs;
}

/**
 * Delete logs older than a certain date
 */
export function pruneOldLogs(beforeDate: Date): number {
  const logs = loadLogs();
  const beforeTime = beforeDate.getTime();
  
  const filteredLogs = logs.filter(log => {
    return new Date(log.timestamp).getTime() >= beforeTime;
  });

  const deletedCount = logs.length - filteredLogs.length;
  
  if (deletedCount > 0) {
    saveLogs(filteredLogs);
  }

  return deletedCount;
}

/**
 * Get activity statistics
 */
export function getActivityStats(userId?: string): {
  totalActions: number;
  actionsByType: Record<string, number>;
  recentActivity: ActivityLog[];
} {
  const { logs } = getLogs({ userId, limit: userId ? 50 : 100 });

  const actionsByType: Record<string, number> = {};
  
  logs.forEach(log => {
    actionsByType[log.action] = (actionsByType[log.action] || 0) + 1;
  });

  return {
    totalActions: logs.length,
    actionsByType,
    recentActivity: logs.slice(0, 10),
  };
}
