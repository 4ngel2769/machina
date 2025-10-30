import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, forceStopVM } from '@/lib/libvirt';

// POST /api/vms/[id]/force-stop - Force stop VM (destroy)
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

    const result = forceStopVM(id);
    
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
    console.error(`Error force stopping VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to force stop VM' },
      { status: 500 }
    );
  }
}
