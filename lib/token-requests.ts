/**
 * Token Request System
 * Users can request tokens, admins approve or deny
 */

import fs from 'fs/promises';
import path from 'path';

export type RequestStatus = 'pending' | 'approved' | 'denied';

export interface TokenRequest {
  id: string;
  userId: string;
  username: string;
  amount: number;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string; // Admin username who approved/denied
  reviewedAt?: string;
  adminNotes?: string;
}

const REQUESTS_FILE = path.join(process.cwd(), 'data', 'token-requests.json');

async function ensureRequestsFile() {
  try {
    await fs.access(REQUESTS_FILE);
  } catch {
    const dataDir = path.dirname(REQUESTS_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(REQUESTS_FILE, JSON.stringify({ requests: [] }, null, 2));
  }
}

export async function getAllRequests(): Promise<TokenRequest[]> {
  await ensureRequestsFile();
  const data = await fs.readFile(REQUESTS_FILE, 'utf-8');
  const parsed = JSON.parse(data);
  return parsed.requests || [];
}

export async function getPendingRequests(): Promise<TokenRequest[]> {
  const requests = await getAllRequests();
  return requests.filter(r => r.status === 'pending').sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getUserRequests(userId: string): Promise<TokenRequest[]> {
  const requests = await getAllRequests();
  return requests.filter(r => r.userId === userId).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getRequestById(id: string): Promise<TokenRequest | null> {
  const requests = await getAllRequests();
  return requests.find(r => r.id === id) || null;
}

export async function createRequest(
  userId: string,
  username: string,
  amount: number,
  reason: string
): Promise<TokenRequest> {
  const requests = await getAllRequests();
  
  const newRequest: TokenRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    username,
    amount,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  requests.push(newRequest);
  await fs.writeFile(REQUESTS_FILE, JSON.stringify({ requests }, null, 2));
  return newRequest;
}

export async function approveRequest(
  requestId: string,
  adminUsername: string,
  adminNotes?: string
): Promise<TokenRequest | null> {
  const requests = await getAllRequests();
  const index = requests.findIndex(r => r.id === requestId);
  
  if (index === -1 || requests[index].status !== 'pending') {
    return null;
  }
  
  requests[index] = {
    ...requests[index],
    status: 'approved',
    reviewedBy: adminUsername,
    reviewedAt: new Date().toISOString(),
    adminNotes,
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(REQUESTS_FILE, JSON.stringify({ requests }, null, 2));
  return requests[index];
}

export async function denyRequest(
  requestId: string,
  adminUsername: string,
  adminNotes?: string
): Promise<TokenRequest | null> {
  const requests = await getAllRequests();
  const index = requests.findIndex(r => r.id === requestId);
  
  if (index === -1 || requests[index].status !== 'pending') {
    return null;
  }
  
  requests[index] = {
    ...requests[index],
    status: 'denied',
    reviewedBy: adminUsername,
    reviewedAt: new Date().toISOString(),
    adminNotes,
    updatedAt: new Date().toISOString(),
  };
  
  await fs.writeFile(REQUESTS_FILE, JSON.stringify({ requests }, null, 2));
  return requests[index];
}

export async function deleteRequest(id: string): Promise<boolean> {
  const requests = await getAllRequests();
  const filtered = requests.filter(r => r.id !== id);
  
  if (filtered.length === requests.length) return false;
  
  await fs.writeFile(REQUESTS_FILE, JSON.stringify({ requests: filtered }, null, 2));
  return true;
}
