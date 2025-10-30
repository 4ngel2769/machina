import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

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
    const { newName, cloneDisks = true } = body;

    if (!newName) {
      return NextResponse.json(
        { error: 'New VM name is required' },
        { status: 400 }
      );
    }

    // Build virt-clone command
    const cloneArgs = [
      'virt-clone',
      '--original', vmName,
      '--name', newName,
      '--auto-clone', // Automatically generate new disk names
    ];

    if (!cloneDisks) {
      cloneArgs.push('--preserve-data'); // Clone without copying disks
    }

    // Execute the clone command
    const command = cloneArgs.join(' ');
    execSync(command, { encoding: 'utf-8' });

    return NextResponse.json(
      {
        message: `VM cloned successfully as ${newName}`,
        newName,
        originalName: vmName,
        disksCloned: cloneDisks,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error cloning VM:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to clone VM',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
