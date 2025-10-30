import fs from 'fs';
import path from 'path';

interface ResourceMetadata {
  id: string;
  type: 'container' | 'vm';
  createdBy: string; // User ID
  createdAt: string;
}

const METADATA_FILE = path.join(process.cwd(), 'data', 'resource-metadata.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Load metadata
function loadMetadata(): ResourceMetadata[] {
  ensureDataDir();
  
  if (!fs.existsSync(METADATA_FILE)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(METADATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading resource metadata:', error);
    return [];
  }
}

// Save metadata
function saveMetadata(metadata: ResourceMetadata[]) {
  ensureDataDir();
  
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving resource metadata:', error);
    throw new Error('Failed to save resource metadata');
  }
}

// Add resource ownership
export function addResourceOwnership(
  resourceId: string,
  type: 'container' | 'vm',
  userId: string
): void {
  const metadata = loadMetadata();
  
  // Remove existing entry if it exists
  const filtered = metadata.filter(m => !(m.id === resourceId && m.type === type));
  
  // Add new entry
  filtered.push({
    id: resourceId,
    type,
    createdBy: userId,
    createdAt: new Date().toISOString(),
  });
  
  saveMetadata(filtered);
}

// Get resource owner
export function getResourceOwner(
  resourceId: string,
  type: 'container' | 'vm'
): string | null {
  const metadata = loadMetadata();
  const entry = metadata.find(m => m.id === resourceId && m.type === type);
  return entry?.createdBy || null;
}

// Remove resource ownership
export function removeResourceOwnership(
  resourceId: string,
  type: 'container' | 'vm'
): void {
  const metadata = loadMetadata();
  const filtered = metadata.filter(m => !(m.id === resourceId && m.type === type));
  saveMetadata(filtered);
}

// Filter resources by user permissions
export function filterResourcesByUser<T extends { id: string }>(
  resources: T[],
  type: 'container' | 'vm',
  userId: string,
  userRole: 'admin' | 'user'
): T[] {
  // Admins can see everything
  if (userRole === 'admin') {
    return resources;
  }
  
  // Regular users can only see their own resources
  const metadata = loadMetadata();
  const userResourceIds = metadata
    .filter(m => m.type === type && m.createdBy === userId)
    .map(m => m.id);
  
  return resources.filter(r => userResourceIds.includes(r.id));
}

// Attach ownership info to resources
export function attachOwnershipInfo<T extends { id: string }>(
  resources: T[],
  type: 'container' | 'vm'
): Array<T & { createdBy?: string }> {
  const metadata = loadMetadata();
  
  return resources.map(resource => {
    const entry = metadata.find(m => m.id === resource.id && m.type === type);
    return {
      ...resource,
      createdBy: entry?.createdBy,
    };
  });
}

// Check if user can access resource
export function canUserAccessResource(
  resourceId: string,
  type: 'container' | 'vm',
  userId: string,
  userRole: 'admin' | 'user'
): boolean {
  // Admins can access everything
  if (userRole === 'admin') {
    return true;
  }
  
  // Check if user owns the resource
  const owner = getResourceOwner(resourceId, type);
  return owner === userId;
}
