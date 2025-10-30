import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, stopVM } from '@/lib/libvirt';
import { auth } from '@/lib/auth/config';
import { logAudit } from '@/lib/audit-logger';
import logger from '@/lib/logger';

// POST /api/vms/[id]/stop - Stop VM (graceful shutdown)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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

    const result = stopVM(id);
    
    if (!result.success) {
      logger.warn('VM stop failed', { userId: session.user.id, vmId: id, error: result.message });
      await logAudit({
        userId: session.user.id,
        username: session.user.name || session.user.id,
        action: 'stop',
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

    logger.info('VM stopped', { userId: session.user.id, vmId: id });
    await logAudit({
      userId: session.user.id,
      username: session.user.name || session.user.id,
      action: 'stop',
      resourceType: 'vm',
      resourceId: id,
      resourceName: id,
      success: true,
    });

    return NextResponse.json({
      message: result.message,
    });
  } catch (error) {
    logger.error('Error stopping VM', { error, vmId: (await params).id });
    console.error(`Error stopping VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop VM' },
      { status: 500 }
    );
  }
}
