import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable } from '@/lib/libvirt';
import { execSync } from 'child_process';

// DELETE /api/networks/[name] - Delete virtual network
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    try {
      // Stop the network if it's running
      try {
        execSync(`virsh net-destroy ${name}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // Network might not be running, continue
      }
      
      // Undefine the network
      execSync(`virsh net-undefine ${name}`, {
        encoding: 'utf-8',
      });
      
      return NextResponse.json({
        message: `Virtual network '${name}' deleted successfully`,
      });
    } catch (error) {
      throw new Error(`Failed to delete network: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`Error deleting network ${(await params).name}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete network' },
      { status: 500 }
    );
  }
}
