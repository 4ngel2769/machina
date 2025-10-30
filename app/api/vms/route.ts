import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, listVMs, createVM } from '@/lib/libvirt';
import { auth } from '@/lib/auth/config';
import {
  attachOwnershipInfo,
  filterResourcesByUser,
  addResourceOwnership,
} from '@/lib/resource-ownership';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';
import { createVMSchema } from '@/lib/validation';
import { checkVMQuota } from '@/lib/quota-system';
import { logAudit } from '@/lib/audit-logger';
import logger from '@/lib/logger';
import { z } from 'zod';

// GET /api/vms - List all VMs
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(
      request,
      getRateLimitIdentifier(request, session.user.id),
      'api'
    );
    if (rateLimitResult) return rateLimitResult;

    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const vms = listVMs();
    
    // Attach ownership information
    const vmsWithOwnership = attachOwnershipInfo(vms, 'vm');

    // Filter by user permissions (admins see all, users see only theirs)
    const filteredVMs = filterResourcesByUser(
      vmsWithOwnership,
      'vm',
      session.user.id,
      session.user.role
    );
    
    return NextResponse.json({
      vms: filteredVMs,
      count: filteredVMs.length,
    });
  } catch (error) {
    console.error('Error listing VMs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list VMs' },
      { status: 500 }
    );
  }
}

// POST /api/vms - Create new VM
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limiting (stricter for creation)
    const rateLimitResult = await rateLimit(
      request,
      getRateLimitIdentifier(request, session.user.id),
      'create'
    );
    if (rateLimitResult) return rateLimitResult;

    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = createVMSchema.parse(body);
    
    // Check quota before creating VM (use storage.size for disk)
    const quotaCheck = await checkVMQuota(
      session.user.id,
      validatedData.vcpus,
      validatedData.memory,
      validatedData.storage.size,
      session.user.role === 'admin'
    );
    
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Quota exceeded', 
          reason: quotaCheck.reason,
          currentUsage: quotaCheck.currentUsage,
          quotas: quotaCheck.quotas
        },
        { status: 403 }
      );
    }
    
    // Map validated data to createVM format
    const vmOptions = {
      name: validatedData.name || `vm-${Date.now()}`,
      memory: validatedData.memory,
      vcpus: validatedData.vcpus,
      disk_size: validatedData.storage.size,
      iso_path: validatedData.installation_medium.type === 'local' 
        ? validatedData.installation_medium.source 
        : undefined,
    };
    
    // Create VM
    const result = createVM(vmOptions);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Store ownership information (use VM name as ID for now)
    // TODO: Update when we have proper VM IDs from libvirt
    if (result.name) {
      addResourceOwnership(result.name, 'vm', session.user.id);
    }

    return NextResponse.json({
      message: result.message,
      vm: {
        name: result.name,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating VM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    );
  }
}
