import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, getVMDetails, deleteVM } from '@/lib/libvirt';

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
    
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const result = deleteVM(id);
    
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
    console.error(`Error deleting VM ${(await params).id}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete VM' },
      { status: 500 }
    );
  }
}
