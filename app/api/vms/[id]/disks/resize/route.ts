import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// POST /api/vms/[name]/disks/resize - Resize a VM disk
export async function POST(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const vmName = params.name;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { diskPath, newSize } = body;

    if (!diskPath || !newSize) {
      return NextResponse.json(
        { error: 'diskPath and newSize are required' },
        { status: 400 }
      );
    }

    // Validate newSize format (e.g., "20G", "500M")
    const sizePattern = /^\d+[KMGT]$/i;
    if (!sizePattern.test(newSize)) {
      return NextResponse.json(
        { error: 'Invalid size format. Use format like "20G" or "500M"' },
        { status: 400 }
      );
    }

    // Check if VM is running
    try {
      const state = execSync(`virsh domstate ${vmName}`, { encoding: 'utf-8' }).trim();
      if (state === 'running') {
        return NextResponse.json(
          { error: 'VM must be stopped before resizing disk' },
          { status: 400 }
        );
      }
    } catch (error) {
      console.error('Error checking VM state:', error);
      return NextResponse.json(
        { error: 'Failed to check VM state' },
        { status: 500 }
      );
    }

    // Get current disk size
    let currentSize = '';
    try {
      const info = execSync(`qemu-img info ${diskPath}`, { encoding: 'utf-8' });
      const sizeMatch = info.match(/virtual size: (.+)/i);
      if (sizeMatch) {
        currentSize = sizeMatch[1];
      }
    } catch (error) {
      console.error('Error getting disk info:', error);
      return NextResponse.json(
        { error: 'Failed to get disk information' },
        { status: 500 }
      );
    }

    // Resize disk (qemu-img resize only supports growing, not shrinking by default)
    try {
      execSync(`qemu-img resize ${diskPath} ${newSize}`, { encoding: 'utf-8' });
    } catch (error) {
      console.error('Error resizing disk:', error);
      return NextResponse.json(
        { 
          error: error instanceof Error ? error.message : 'Failed to resize disk',
          details: 'Note: qemu-img resize only supports growing disks, not shrinking'
        },
        { status: 500 }
      );
    }

    // Get new disk size
    let updatedSize = '';
    try {
      const info = execSync(`qemu-img info ${diskPath}`, { encoding: 'utf-8' });
      const sizeMatch = info.match(/virtual size: (.+)/i);
      if (sizeMatch) {
        updatedSize = sizeMatch[1];
      }
    } catch (error) {
      console.error('Error getting updated disk info:', error);
    }

    return NextResponse.json({
      message: 'Disk resized successfully',
      diskPath,
      previousSize: currentSize,
      newSize: updatedSize || newSize,
      note: 'You may need to resize the filesystem inside the VM to use the additional space',
    });
  } catch (error) {
    console.error('Error resizing disk:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resize disk' },
      { status: 500 }
    );
  }
}
