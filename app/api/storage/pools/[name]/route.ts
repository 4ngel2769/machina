import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable } from '@/lib/libvirt';
import { execSync } from 'child_process';

// DELETE /api/storage/pools/[name] - Delete storage pool
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
      // Stop the pool if it's running
      try {
        execSync(`virsh pool-destroy ${name}`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // Pool might not be running, continue
      }
      
      // Undefine the pool
      execSync(`virsh pool-undefine ${name}`, {
        encoding: 'utf-8',
      });
      
      return NextResponse.json({
        message: `Storage pool '${name}' deleted successfully`,
      });
    } catch (error) {
      throw new Error(`Failed to delete storage pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`Error deleting storage pool ${(await params).name}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete storage pool' },
      { status: 500 }
    );
  }
}

// GET /api/storage/pools/[name] - Get pool volumes
export async function GET(
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
      // List volumes in the pool
      const output = execSync(`virsh vol-list ${name}`, {
        encoding: 'utf-8',
      });
      
      const volumes: Array<{ name: string; path: string }> = [];
      const lines = output.split('\n').slice(2); // Skip headers
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          volumes.push({
            name: parts[0],
            path: parts[1],
          });
        }
      }
      
      return NextResponse.json({
        pool: name,
        volumes,
        count: volumes.length,
      });
    } catch (error) {
      throw new Error(`Failed to list volumes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    console.error(`Error getting volumes for pool ${(await params).name}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get pool volumes' },
      { status: 500 }
    );
  }
}
