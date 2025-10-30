import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable } from '@/lib/libvirt';
import { execSync } from 'child_process';

// POST /api/networks/[name]/stop - Stop virtual network
export async function POST(
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
      execSync(`virsh net-destroy ${name}`, {
        encoding: 'utf-8',
      });
      
      return NextResponse.json({
        message: `Virtual network '${name}' stopped successfully`,
      });
    } catch (error) {
      throw new Error(`Failed to stop network: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`Error stopping network ${(await params).name}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop network' },
      { status: 500 }
    );
  }
}
