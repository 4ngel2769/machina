import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable } from '@/lib/libvirt';
import { execSync } from 'child_process';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: name } = await params;
    const body = await request.json();
    
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'libvirt is not available' },
        { status: 503 }
      );
    }

    // Update memory if provided
    if (body.memory !== undefined) {
      try {
        execSync(`virsh setmaxmem ${name} ${body.memory}M --config`, { encoding: 'utf-8' });
        execSync(`virsh setmem ${name} ${body.memory}M --config`, { encoding: 'utf-8' });
      } catch (error) {
        console.error('Failed to update memory:', error);
        return NextResponse.json(
          { error: 'Failed to update memory configuration' },
          { status: 500 }
        );
      }
    }

    // Update vCPUs if provided
    if (body.vcpus !== undefined) {
      try {
        execSync(`virsh setvcpus ${name} ${body.vcpus} --config --maximum`, { encoding: 'utf-8' });
        execSync(`virsh setvcpus ${name} ${body.vcpus} --config`, { encoding: 'utf-8' });
      } catch (error) {
        console.error('Failed to update vCPUs:', error);
        return NextResponse.json(
          { error: 'Failed to update vCPU configuration' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      message: 'VM configuration updated successfully',
    });
  } catch (error) {
    console.error('Failed to update VM config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VM configuration' },
      { status: 500 }
    );
  }
}
