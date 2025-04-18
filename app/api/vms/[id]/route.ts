import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, getVMDetails, deleteVM } from '@/lib/libvirt';
import { auth } from '@/lib/auth/config';
import { logAudit } from '@/lib/audit-logger';
import logger from '@/lib/logger';

// GET /api/vms/[id] - Get VM details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const details = getVMDetails(id);
    
    if (!details || Object.keys(details).length === 0) {
      return NextResponse.json(
        { error: `VM '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      vm: {
        id,
        name: id,
        ...details,
      },
    });
  } catch (error) {
    console.error(`Error getting VM details for ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VM details' },
      { status: 500 }
    );
  }
}

// DELETE /api/vms/[id] - Delete VM
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const result = deleteVM(id);
    
    if (!result.success) {
      logger.error('VM deletion failed', {
        userId: session.user.id,
        vmId: id,
        error: result.message,
      });
      
      await logAudit({
        userId: session.user.id,
        username: session.user.name || session.user.id,
        action: 'delete',
        resourceType: 'vm',
        resourceId: id,
        resourceName: id,
        success: false,
        errorMessage: result.message,
      });
      
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    logger.info('VM deleted successfully', {
      userId: session.user.id,
      vmId: id,
    });
    
    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'delete',
      resourceType: 'vm',
      resourceId: id,
      resourceName: id,
      success: true,
    });

    return NextResponse.json({
      message: result.message,
    });
  } catch (error) {
    logger.error('Error deleting VM', { error, vmId: (await params).id });
    console.error(`Error deleting VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete VM' },
      { status: 500 }
    );
  }
}
