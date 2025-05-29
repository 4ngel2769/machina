/**
 * User Contract System
 * Monthly subscription contracts with auto-refill tokens
 * Like AWS Reserved Instances or monthly billing contracts
 */

import fs from 'fs/promises';
import path from 'path';

export type ContractStatus = 'active' | 'paused' | 'cancelled' | 'expired';

export interface UserContract {
  id: string;
  userId: string;
  username: string;
  tokensPerMonth: number;
  durationMonths: number; // Total contract duration
  startDate: string;
  endDate: string;
  nextRefillDate: string;
  status: ContractStatus;
  totalRefills: number; // How many times tokens have been refilled
  createdBy: string; // Admin who created the contract
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

const CONTRACTS_FILE = path.join(process.cwd(), 'data', 'user-contracts.json');

async function ensureContractsFile() {
  try {
    await fs.access(CONTRACTS_FILE);
  } catch {
    const dataDir = path.dirname(CONTRACTS_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(CONTRACTS_FILE, JSON.stringify({ contracts: [] }, null, 2));
  }
}

export async function getAllContracts(): Promise<UserContract[]> {
  await ensureContractsFile();
  const data = await fs.readFile(CONTRACTS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  return parsed.contracts || [];
}

export async function getActiveContracts(): Promise<UserContract[]> {
  const contracts = await getAllContracts();
  return contracts.filter(c => c.status === 'active');
}

export async function getUserContracts(userId: string): Promise<UserContract[]> {
  const contracts = await getAllContracts();
  return contracts.filter(c => c.userId === userId).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getContractById(id: string): Promise<UserContract | null> {
  const contracts = await getAllContracts();
  return contracts.find(c => c.id === id) || null;
}

export async function createContract(
  userId: string,
  username: string,
  tokensPerMonth: number,
  durationMonths: number,
  createdBy: string,
  notes?: string
): Promise<UserContract> {
  const contracts = await getAllContracts();
  
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + durationMonths);
  
  const nextRefillDate = new Date(startDate);
  nextRefillDate.setMonth(nextRefillDate.getMonth() + 1);
  
  const newContract: UserContract = {
    id: `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    username,
    tokensPerMonth,
    durationMonths,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    nextRefillDate: nextRefillDate.toISOString(),
    status: 'active',
    totalRefills: 0,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes,
  };
  
  contracts.push(newContract);
  await fs.writeFile(CONTRACTS_FILE, JSON.stringify({ contracts }, null, 2));
  return newContract;
}

export async function updateContractStatus(
  contractId: string,
  status: ContractStatus
): Promise<UserContract | null> {
  const contracts = await getAllContracts();
  const index = contracts.findIndex(c => c.id === contractId);
  
  if (index === -1) return null;
  
  contracts[index] = {
    ...contracts[index],
    status,
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(CONTRACTS_FILE, JSON.stringify({ contracts }, null, 2));
  return contracts[index];
}

export async function recordRefill(contractId: string): Promise<UserContract | null> {
  const contracts = await getAllContracts();
  const index = contracts.findIndex(c => c.id === contractId);
  
  if (index === -1) return null;
  
  const nextRefillDate = new Date(contracts[index].nextRefillDate);
  nextRefillDate.setMonth(nextRefillDate.getMonth() + 1);
  
  contracts[index] = {
    ...contracts[index],
    totalRefills: contracts[index].totalRefills + 1,
    nextRefillDate: nextRefillDate.toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(CONTRACTS_FILE, JSON.stringify({ contracts }, null, 2));
  return contracts[index];
}

export async function deleteContract(id: string): Promise<boolean> {
  const contracts = await getAllContracts();
  const filtered = contracts.filter(c => c.id !== id);
  
  if (filtered.length === contracts.length) return false;
  
  await fs.writeFile(CONTRACTS_FILE, JSON.stringify({ contracts: filtered }, null, 2));
  return true;
}

// Check for contracts that need refilling
export async function getContractsDueForRefill(): Promise<UserContract[]> {
  const contracts = await getActiveContracts();
  const now = new Date();
  
  return contracts.filter(contract => {
    const nextRefill = new Date(contract.nextRefillDate);
    const endDate = new Date(contract.endDate);
    
    // Due for refill and not expired
    return nextRefill <= now && endDate > now;
  });
}

// Check for expired contracts
export async function getExpiredContracts(): Promise<UserContract[]> {
  const contracts = await getAllContracts();
  const now = new Date();
  
  return contracts.filter(contract => {
    const endDate = new Date(contract.endDate);
    return contract.status === 'active' && endDate <= now;
  });
}
