import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, resumeVM } from '@/lib/libvirt';

// POST /api/vms/[id]/resume - Resume paused VM
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

    const result = resumeVM(id);
    
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
    console.error(`Error resuming VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resume VM' },
      { status: 500 }
    );
  }
}
