import fs from 'fs/promises';
import path from 'path';
import { RESOURCE_PLANS, ResourcePlan, getPlanById } from './token-plans';

export interface UserQuota {
  userId: string;
  username: string;
  currentPlan: string; // Plan ID (free, basic, pro, enterprise, admin)
  tokenBalance: number; // Available tokens
  quotas: {
    maxVCpus: number;        // Total vCPUs across all VMs
    maxMemoryMB: number;     // Total RAM in MB across all VMs
    maxDiskGB: number;       // Total disk space in GB across all VMs
    maxVMs: number;          // Maximum number of VMs
    maxContainers: number;   // Maximum number of containers
  };
  usage: {
    currentVCpus: number;
    currentMemoryMB: number;
    currentDiskGB: number;
    currentVMs: number;
    currentContainers: number;
  };
  suspended: boolean;
  planActivatedAt?: string; // When current plan was activated
  planExpiresAt?: string;   // When plan needs renewal (monthly)
  createdAt: string;
  updatedAt: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage?: {
    currentVCpus: number;
    currentMemoryMB: number;
    currentDiskGB: number;
    currentVMs: number;
    currentContainers: number;
  };
  quotas?: UserQuota['quotas'];
}

const QUOTA_FILE = path.join(process.cwd(), 'data', 'user-quotas.json');

// Default plan for new users
const DEFAULT_PLAN = 'free';

// Default token balance for new users
const DEFAULT_TOKEN_BALANCE = 0;

// Initialize quota file
async function ensureQuotaFile() {
  try {
    await fs.access(QUOTA_FILE);
  } catch {
    const dataDir = path.dirname(QUOTA_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(QUOTA_FILE, JSON.stringify({ quotas: [] }, null, 2));
  }
}

// Read all quotas
export async function getAllQuotas(): Promise<UserQuota[]> {
  await ensureQuotaFile();
  const data = await fs.readFile(QUOTA_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  return parsed.quotas || [];
}

// Get quota for a specific user
export async function getUserQuota(userId: string): Promise<UserQuota | null> {
  const quotas = await getAllQuotas();
  return quotas.find(q => q.userId === userId) || null;
}

// Create or update user quota
export async function setUserQuota(
  userId: string,
  username: string,
  quotas: Partial<UserQuota['quotas']>,
  isAdmin: boolean = false
): Promise<UserQuota> {
  const allQuotas = await getAllQuotas();
  const existingIndex = allQuotas.findIndex(q => q.userId === userId);
  
  const now = new Date().toISOString();
  const planId = isAdmin ? 'admin' : (existingIndex >= 0 ? allQuotas[existingIndex].currentPlan : DEFAULT_PLAN);
  const plan = getPlanById(planId);
  const finalQuotas = plan ? plan.quotas : { ...quotas };
  
  const userQuota: UserQuota = {
    userId,
    username,
    currentPlan: planId,
    tokenBalance: existingIndex >= 0 ? allQuotas[existingIndex].tokenBalance : DEFAULT_TOKEN_BALANCE,
    quotas: finalQuotas,
    usage: existingIndex >= 0 ? allQuotas[existingIndex].usage : {
      currentVCpus: 0,
      currentMemoryMB: 0,
      currentDiskGB: 0,
      currentVMs: 0,
      currentContainers: 0,
    },
    suspended: existingIndex >= 0 ? allQuotas[existingIndex].suspended : false,
    planActivatedAt: existingIndex >= 0 ? allQuotas[existingIndex].planActivatedAt : now,
    planExpiresAt: existingIndex >= 0 ? allQuotas[existingIndex].planExpiresAt : undefined,
    createdAt: existingIndex >= 0 ? allQuotas[existingIndex].createdAt : now,
    updatedAt: now,
  };
  
  if (existingIndex >= 0) {
    allQuotas[existingIndex] = userQuota;
  } else {
    allQuotas.push(userQuota);
  }
  
  await fs.writeFile(QUOTA_FILE, JSON.stringify({ quotas: allQuotas }, null, 2));
  return userQuota;
}

// Update usage for a user
export async function updateUserUsage(
  userId: string,
  usage: Partial<UserQuota['usage']>
): Promise<void> {
  const allQuotas = await getAllQuotas();
  const index = allQuotas.findIndex(q => q.userId === userId);
  
  if (index >= 0) {
    allQuotas[index].usage = { ...allQuotas[index].usage, ...usage };
    allQuotas[index].updatedAt = new Date().toISOString();
    await fs.writeFile(QUOTA_FILE, JSON.stringify({ quotas: allQuotas }, null, 2));
  }
}

// Calculate current usage from resources
export async function calculateUserUsage(userId: string): Promise<UserQuota['usage']> {
  // This would normally query containers and VMs, but for now we'll use stored values
  const quota = await getUserQuota(userId);
  return quota?.usage || {
    currentVCpus: 0,
    currentMemoryMB: 0,
    currentDiskGB: 0,
    currentVMs: 0,
    currentContainers: 0,
  };
}

// Check if user can create a VM with given resources
export async function checkVMQuota(
  userId: string,
  vcpus: number,
  memoryMB: number,
  diskGB: number,
  isAdmin: boolean = false
): Promise<QuotaCheckResult> {
  // Admins bypass quota checks
  if (isAdmin) {
    return { allowed: true };
  }
  
  const quota = await getUserQuota(userId);
  if (!quota) {
    return { allowed: false, reason: 'No quota found for user' };
  }
  
  if (quota.suspended) {
    return { allowed: false, reason: 'Account is suspended' };
  }
  
  // Check VM count
  if (quota.usage.currentVMs >= quota.quotas.maxVMs) {
    return {
      allowed: false,
      reason: `Maximum VM limit reached (${quota.quotas.maxVMs} VMs)`,
      currentUsage: quota.usage,
      quotas: quota.quotas,
    };
  }
  
  // Check vCPU quota
  if (quota.usage.currentVCpus + vcpus > quota.quotas.maxVCpus) {
    return {
      allowed: false,
      reason: `Insufficient vCPU quota (${quota.usage.currentVCpus}/${quota.quotas.maxVCpus} used, need ${vcpus} more)`,
      currentUsage: quota.usage,
      quotas: quota.quotas,
    };
  }
  
  // Check memory quota
  if (quota.usage.currentMemoryMB + memoryMB > quota.quotas.maxMemoryMB) {
    return {
      allowed: false,
      reason: `Insufficient memory quota (${quota.usage.currentMemoryMB}MB/${quota.quotas.maxMemoryMB}MB used, need ${memoryMB}MB more)`,
      currentUsage: quota.usage,
      quotas: quota.quotas,
    };
  }
  
  // Check disk quota
  if (quota.usage.currentDiskGB + diskGB > quota.quotas.maxDiskGB) {
    return {
      allowed: false,
      reason: `Insufficient disk quota (${quota.usage.currentDiskGB}GB/${quota.quotas.maxDiskGB}GB used, need ${diskGB}GB more)`,
      currentUsage: quota.usage,
      quotas: quota.quotas,
    };
  }
  
  return {
    allowed: true,
    currentUsage: quota.usage,
    quotas: quota.quotas,
  };
}

// Check if user can create a container
export async function checkContainerQuota(
  userId: string,
  isAdmin: boolean = false
): Promise<QuotaCheckResult> {
  // Admins bypass quota checks
  if (isAdmin) {
    return { allowed: true };
  }
  
  const quota = await getUserQuota(userId);
  if (!quota) {
    return { allowed: false, reason: 'No quota found for user' };
  }
  
  if (quota.suspended) {
    return { allowed: false, reason: 'Account is suspended' };
  }
  
  if (quota.usage.currentContainers >= quota.quotas.maxContainers) {
    return {
      allowed: false,
      reason: `Maximum container limit reached (${quota.quotas.maxContainers} containers)`,
      currentUsage: quota.usage,
      quotas: quota.quotas,
    };
  }
  
  return {
    allowed: true,
    currentUsage: quota.usage,
    quotas: quota.quotas,
  };
}

// Suspend/unsuspend user
export async function setUserSuspended(userId: string, suspended: boolean): Promise<void> {
  const allQuotas = await getAllQuotas();
  const index = allQuotas.findIndex(q => q.userId === userId);
  
  if (index >= 0) {
    allQuotas[index].suspended = suspended;
    allQuotas[index].updatedAt = new Date().toISOString();
    await fs.writeFile(QUOTA_FILE, JSON.stringify({ quotas: allQuotas }, null, 2));
  }
}

// Delete user quota
export async function deleteUserQuota(userId: string): Promise<void> {
  const allQuotas = await getAllQuotas();
  const filtered = allQuotas.filter(q => q.userId !== userId);
  await fs.writeFile(QUOTA_FILE, JSON.stringify({ quotas: filtered }, null, 2));
}

// Get quota usage percentage
export function getQuotaUsagePercentage(usage: number, quota: number): number {
  if (quota === 0) return 0;
  return Math.min(Math.round((usage / quota) * 100), 100);
}

// Check if user is approaching quota limit (>80%)
export function isApproachingLimit(usage: number, quota: number): boolean {
  return getQuotaUsagePercentage(usage, quota) >= 80;
}
