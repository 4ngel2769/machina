/**
 * Token-based plan system similar to cloud VPS platforms
 * Plans: Free, Basic, Pro, Enterprise
 * Users spend tokens to upgrade/activate plans
 */

export interface ResourcePlan {
  id: string;
  name: string;
  description: string;
  tokenCost: number; // Monthly cost in tokens
  quotas: {
    maxVCpus: number;
    maxMemoryMB: number;
    maxDiskGB: number;
    maxVMs: number;
    maxContainers: number;
  };
  features: string[];
  recommended?: boolean;
}

// Available plans (like AWS, GCP, DigitalOcean tiers)
export const RESOURCE_PLANS: Record<string, ResourcePlan> = {
  free: {
    id: 'free',
    name: 'Free Tier',
    description: 'Perfect for testing and small projects',
    tokenCost: 0, // Free forever
    quotas: {
      maxVCpus: 2,
      maxMemoryMB: 2048, // 2 GB
      maxDiskGB: 20,
      maxVMs: 1,
      maxContainers: 3,
    },
    features: [
      '2 vCPUs',
      '2 GB RAM',
      '20 GB Storage',
      '1 VM',
      '3 Containers',
      'Community support',
    ],
  },
  
  basic: {
    id: 'basic',
    name: 'Basic',
    description: 'For hobbyists and small applications',
    tokenCost: 100, // 100 tokens/month
    quotas: {
      maxVCpus: 4,
      maxMemoryMB: 8192, // 8 GB
      maxDiskGB: 50,
      maxVMs: 3,
      maxContainers: 10,
    },
    features: [
      '4 vCPUs',
      '8 GB RAM',
      '50 GB Storage',
      '3 VMs',
      '10 Containers',
      'Email support',
      'Daily backups',
    ],
    recommended: true,
  },
  
  pro: {
    id: 'pro',
    name: 'Professional',
    description: 'For production workloads and teams',
    tokenCost: 300, // 300 tokens/month
    quotas: {
      maxVCpus: 16,
      maxMemoryMB: 32768, // 32 GB
      maxDiskGB: 200,
      maxVMs: 10,
      maxContainers: 50,
    },
    features: [
      '16 vCPUs',
      '32 GB RAM',
      '200 GB Storage',
      '10 VMs',
      '50 Containers',
      'Priority support',
      'Hourly backups',
      'Advanced monitoring',
    ],
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large-scale deployments',
    tokenCost: 1000, // 1000 tokens/month
    quotas: {
      maxVCpus: 64,
      maxMemoryMB: 131072, // 128 GB
      maxDiskGB: 1000,
      maxVMs: 50,
      maxContainers: 200,
    },
    features: [
      '64 vCPUs',
      '128 GB RAM',
      '1 TB Storage',
      '50 VMs',
      '200 Containers',
      '24/7 Support',
      'Real-time backups',
      'Advanced monitoring',
      'Custom solutions',
      'SLA guarantee',
    ],
  },
  
  // Admin users get unlimited (no token cost)
  admin: {
    id: 'admin',
    name: 'Administrator',
    description: 'Unlimited resources for administrators',
    tokenCost: 0,
    quotas: {
      maxVCpus: 999,
      maxMemoryMB: 999999,
      maxDiskGB: 99999,
      maxVMs: 999,
      maxContainers: 999,
    },
    features: [
      'Unlimited resources',
      'Full system access',
      'User management',
      'All features',
    ],
  },
};

// Helper to get plan by ID
export function getPlanById(planId: string): ResourcePlan | null {
  return RESOURCE_PLANS[planId] || null;
}

// Helper to get all available plans (excluding admin)
export function getAvailablePlans(): ResourcePlan[] {
  return Object.values(RESOURCE_PLANS).filter(plan => plan.id !== 'admin');
}

// Helper to calculate monthly token cost for a plan
export function calculateMonthlyCost(planId: string): number {
  const plan = getPlanById(planId);
  return plan ? plan.tokenCost : 0;
}

// Helper to check if user can afford a plan
export function canAffordPlan(userTokens: number, planId: string): boolean {
  const cost = calculateMonthlyCost(planId);
  return userTokens >= cost;
}

// Helper to get plan upgrade path
export function getUpgradePath(currentPlanId: string): string[] {
  const order = ['free', 'basic', 'pro', 'enterprise'];
  const currentIndex = order.indexOf(currentPlanId);
  
  if (currentIndex === -1) return order;
  return order.slice(currentIndex + 1);
}

// Helper to calculate token difference between plans
export function getUpgradeCost(fromPlanId: string, toPlanId: string): number {
  const fromCost = calculateMonthlyCost(fromPlanId);
  const toCost = calculateMonthlyCost(toPlanId);
  return Math.max(0, toCost - fromCost);
}

// Format tokens for display
export function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

// Check if plan is an upgrade from current plan
export function isUpgrade(fromPlanId: string, toPlanId: string): boolean {
  const order = ['free', 'basic', 'pro', 'enterprise'];
  const fromIndex = order.indexOf(fromPlanId);
  const toIndex = order.indexOf(toPlanId);
  return toIndex > fromIndex;
}
