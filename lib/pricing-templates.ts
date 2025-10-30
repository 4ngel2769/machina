/**
 * Pricing Templates System
 * Admin-configurable VM and Container templates with token costs
 * Similar to AWS EC2 instance types or DigitalOcean droplets
 */

export type BillingType = 'hourly' | 'monthly' | 'one-time';
export type TemplateType = 'vm' | 'container';

export interface PricingTemplate {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  billingType: BillingType;
  tokenCost: number; // Cost in tokens per billing period
  specs: {
    vcpus?: number;
    memoryMB?: number;
    diskGB?: number;
    imageUrl?: string; // For VMs
    dockerImage?: string; // For containers
  };
  active: boolean;
  featured?: boolean;
  createdAt: string;
  updatedAt: string;
}

import fs from 'fs/promises';
import path from 'path';

const TEMPLATES_FILE = path.join(process.cwd(), 'data', 'pricing-templates.json');

// Default templates (like AWS t2.micro, t2.small, etc.)
const DEFAULT_TEMPLATES: PricingTemplate[] = [
  // VM Templates
  {
    id: 'vm-tiny',
    type: 'vm',
    name: 'VM - Tiny',
    description: 'Perfect for testing and development',
    billingType: 'hourly',
    tokenCost: 5,
    specs: {
      vcpus: 1,
      memoryMB: 1024,
      diskGB: 10,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vm-small',
    type: 'vm',
    name: 'VM - Small',
    description: 'Good for small applications',
    billingType: 'hourly',
    tokenCost: 10,
    specs: {
      vcpus: 2,
      memoryMB: 2048,
      diskGB: 20,
    },
    active: true,
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vm-medium',
    type: 'vm',
    name: 'VM - Medium',
    description: 'For production workloads',
    billingType: 'hourly',
    tokenCost: 20,
    specs: {
      vcpus: 4,
      memoryMB: 8192,
      diskGB: 50,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'vm-large',
    type: 'vm',
    name: 'VM - Large',
    description: 'High-performance computing',
    billingType: 'hourly',
    tokenCost: 40,
    specs: {
      vcpus: 8,
      memoryMB: 16384,
      diskGB: 100,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  // Container Templates
  {
    id: 'container-micro',
    type: 'container',
    name: 'Container - Micro',
    description: 'Minimal container for microservices',
    billingType: 'hourly',
    tokenCost: 2,
    specs: {
      memoryMB: 512,
      vcpus: 1,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'container-small',
    type: 'container',
    name: 'Container - Small',
    description: 'Standard container deployment',
    billingType: 'hourly',
    tokenCost: 5,
    specs: {
      memoryMB: 1024,
      vcpus: 2,
    },
    active: true,
    featured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'container-medium',
    type: 'container',
    name: 'Container - Medium',
    description: 'For resource-intensive containers',
    billingType: 'hourly',
    tokenCost: 10,
    specs: {
      memoryMB: 2048,
      vcpus: 4,
    },
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function ensureTemplatesFile() {
  try {
    await fs.access(TEMPLATES_FILE);
  } catch {
    const dataDir = path.dirname(TEMPLATES_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates: DEFAULT_TEMPLATES }, null, 2));
  }
}

export async function getAllTemplates(): Promise<PricingTemplate[]> {
  await ensureTemplatesFile();
  const data = await fs.readFile(TEMPLATES_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  return parsed.templates || [];
}

export async function getActiveTemplates(type?: TemplateType): Promise<PricingTemplate[]> {
  const templates = await getAllTemplates();
  return templates.filter(t => t.active && (!type || t.type === type));
}

export async function getTemplateById(id: string): Promise<PricingTemplate | null> {
  const templates = await getAllTemplates();
  return templates.find(t => t.id === id) || null;
}

export async function createTemplate(template: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<PricingTemplate> {
  const templates = await getAllTemplates();
  
  const newTemplate: PricingTemplate = {
    ...template,
    id: `${template.type}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  templates.push(newTemplate);
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates }, null, 2));
  return newTemplate;
}

export async function updateTemplate(id: string, updates: Partial<Omit<PricingTemplate, 'id' | 'createdAt'>>): Promise<PricingTemplate | null> {
  const templates = await getAllTemplates();
  const index = templates.findIndex(t => t.id === id);
  
  if (index === -1) return null;
  
  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates }, null, 2));
  return templates[index];
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const templates = await getAllTemplates();
  const filtered = templates.filter(t => t.id !== id);
  
  if (filtered.length === templates.length) return false;
  
  await fs.writeFile(TEMPLATES_FILE, JSON.stringify({ templates: filtered }, null, 2));
  return true;
}

// Calculate cost for a time period
export function calculateCost(template: PricingTemplate, hours: number): number {
  if (template.billingType === 'one-time') {
    return template.tokenCost;
  }
  
  if (template.billingType === 'hourly') {
    return template.tokenCost * hours;
  }
  
  // Monthly - assume 730 hours per month
  return Math.ceil((template.tokenCost / 730) * hours);
}
