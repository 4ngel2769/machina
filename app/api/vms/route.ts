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
import { assignStaticIP } from '@/lib/user-networks';
import { isPathWithinUserIsoDir } from '@/lib/iso-storage';

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
    const vmName = validatedData.name || `vm-${Date.now()}`;
    
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
    
    const isAdmin = session.user.role === 'admin';
    const installationType = validatedData.installation_medium.type;
    let isoPath: string | undefined;
    if (installationType === 'local') {
      if (!validatedData.installation_medium.source) {
        return NextResponse.json({ error: 'ISO source is required for local installations' }, { status: 400 });
      }
      isoPath = validatedData.installation_medium.source;
      if (!isAdmin && !isPathWithinUserIsoDir(session.user.id, isoPath)) {
        return NextResponse.json({ error: 'Users must upload ISOs via the secure uploader. Host filesystem paths are not allowed.' }, { status: 403 });
      }
    }

    const tenantNetwork = await assignStaticIP(session.user.id, vmName, session.user.name || undefined);
    
    // Map validated data to createVM format
    const vmOptions = {
      name: vmName,
      memory: validatedData.memory,
      vcpus: validatedData.vcpus,
      disk_size: validatedData.storage.size * 1024, // Convert GB to MB
      iso_path: isoPath,
      network: {
        source: tenantNetwork.networkName,
        mac: tenantNetwork.macAddress,
        static_ip: tenantNetwork.ipAddress,
      },
    };
    
    // Create VM
    const result = createVM(vmOptions);
    
    if (!result.success) {
      logger.error('VM creation failed', { 
        userId: session.user.id, 
        vmName: vmOptions.name, 
        error: result.message 
      });
      
      await logAudit({
        userId: session.user.id,
        username: session.user.name || session.user.id,
        action: 'create',
        resourceType: 'vm',
        resourceName: vmOptions.name,
        success: false,
        errorMessage: result.message,
      });
      
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

    logger.info('VM created successfully', { 
      userId: session.user.id, 
      vmName: result.name 
    });
    
    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'create',
      resourceType: 'vm',
      resourceId: result.name,
      resourceName: result.name,
      success: true,
      details: `CPU: ${validatedData.vcpus}, Memory: ${validatedData.memory}MB, Disk: ${validatedData.storage.size}GB`,
    });

    return NextResponse.json({
      message: result.message,
      vm: {
        name: result.name,
        network: tenantNetwork,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    logger.error('Error creating VM', { error });
    console.error('Error creating VM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    );
  }
}
