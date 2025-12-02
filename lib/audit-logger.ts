import fs from 'fs';
import path from 'path';
import logger from './logger';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  resourceType?: 'container' | 'vm' | 'user' | 'setting' | 'auth' | 'iso';
  resourceId?: string;
  resourceName?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

const AUDIT_LOG_DIR = path.join(process.cwd(), 'logs', 'audit');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'audit.jsonl');

// Ensure audit log directory exists
function ensureAuditLogDir() {
  if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
  }
}

// Write audit log entry
export function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  ensureAuditLogDir();

  const fullEntry: AuditLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };

  // Write to audit log file (JSONL format - one JSON object per line)
  const logLine = JSON.stringify(fullEntry) + '\n';
  fs.appendFileSync(AUDIT_LOG_FILE, logLine, 'utf-8');

  // Also log to winston for structured logging
  logger.info('Audit log entry', fullEntry);
}

// Get audit log entries with filtering
export function getAuditLogs(options: {
  userId?: string;
  action?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}): AuditLogEntry[] {
  ensureAuditLogDir();

  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return [];
  }

  const { userId, action, resourceType, limit = 100, offset = 0, startDate, endDate } = options;

  // Read log file
  const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  // Parse and filter entries
  let entries = lines
    .map(line => {
      try {
        return JSON.parse(line) as AuditLogEntry;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is AuditLogEntry => entry !== null);

  // Apply filters
  if (userId) {
    entries = entries.filter(e => e.userId === userId);
  }
  if (action) {
    entries = entries.filter(e => e.action === action);
  }
  if (resourceType) {
    entries = entries.filter(e => e.resourceType === resourceType);
  }
  if (startDate) {
    entries = entries.filter(e => new Date(e.timestamp) >= startDate);
  }
  if (endDate) {
    entries = entries.filter(e => new Date(e.timestamp) <= endDate);
  }

  // Sort by timestamp descending (newest first)
  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply pagination
  return entries.slice(offset, offset + limit);
}

// Get audit log statistics
export function getAuditStats(userId?: string): {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actionsByType: Record<string, number>;
  recentActions: AuditLogEntry[];
} {
  ensureAuditLogDir();

  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return {
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0,
      actionsByType: {},
      recentActions: [],
    };
  }

  const allLogs = getAuditLogs({ userId, limit: 10000 });

  const stats = {
    totalActions: allLogs.length,
    successfulActions: allLogs.filter(e => e.success).length,
    failedActions: allLogs.filter(e => !e.success).length,
    actionsByType: {} as Record<string, number>,
    recentActions: allLogs.slice(0, 10),
  };

  // Count actions by type
  allLogs.forEach(entry => {
    stats.actionsByType[entry.action] = (stats.actionsByType[entry.action] || 0) + 1;
  });

  return stats;
}

// Clear old audit logs (older than specified days)
export function cleanupAuditLogs(daysToKeep = 90): number {
  ensureAuditLogDir();

  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const content = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  const keptLines: string[] = [];
  let removedCount = 0;

  lines.forEach(line => {
    try {
      const entry = JSON.parse(line) as AuditLogEntry;
      if (new Date(entry.timestamp) >= cutoffDate) {
        keptLines.push(line);
      } else {
        removedCount++;
      }
    } catch {
      // Keep malformed lines to avoid data loss
      keptLines.push(line);
    }
  });

  // Write back filtered content
  fs.writeFileSync(AUDIT_LOG_FILE, keptLines.join('\n') + '\n', 'utf-8');

  logger.info(`Cleaned up ${removedCount} audit log entries older than ${daysToKeep} days`);
  return removedCount;
}
