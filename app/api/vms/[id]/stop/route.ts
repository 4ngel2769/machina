import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, stopVM } from '@/lib/libvirt';

// POST /api/vms/[id]/stop - Stop VM (graceful shutdown)
export async function POST(
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

    const result = stopVM(id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: result.message,
    });
  } catch (error) {
    console.error(`Error stopping VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop VM' },
      { status: 500 }
    );
  }
}
