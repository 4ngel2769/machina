import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// GET /api/vms/[name]/snapshots - List all snapshots
export async function GET(
  _request: NextRequest,
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
    // List all snapshots for the VM
    const output = execSync(`virsh snapshot-list ${vmName} --name`, {
      encoding: 'utf-8',
    });

    const snapshotNames = output
      .trim()
      .split('\n')
      .filter((name) => name.length > 0);

    // Get details for each snapshot
    const snapshots = snapshotNames.map((name) => {
      try {
        const info = execSync(`virsh snapshot-info ${vmName} ${name}`, {
          encoding: 'utf-8',
        });

        // Parse snapshot info
        const stateMatch = info.match(/State:\s+(.+)/);
        const creationMatch = info.match(/Creation Time:\s+(.+)/);
        const currentMatch = info.match(/Current:\s+(.+)/);

        return {
          name,
          state: stateMatch ? stateMatch[1].trim() : 'unknown',
          creationTime: creationMatch ? creationMatch[1].trim() : '',
          isCurrent: currentMatch ? currentMatch[1].trim() === 'yes' : false,
        };
      } catch {
        return {
          name,
          state: 'unknown',
          creationTime: '',
          isCurrent: false,
        };
      }
    });

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('Error listing snapshots:', error);
    return NextResponse.json(
      { error: 'Failed to list snapshots', snapshots: [] },
      { status: 500 }
    );
  }
}

// POST /api/vms/[name]/snapshots - Create a new snapshot
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
    const { name, description = '' } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Snapshot name is required' },
        { status: 400 }
      );
    }

    // Create snapshot using virsh snapshot-create-as
    const descArg = description ? `--description "${description}"` : '';
    execSync(`virsh snapshot-create-as ${vmName} ${name} ${descArg}`, {
      encoding: 'utf-8',
    });

    return NextResponse.json(
      { message: `Snapshot "${name}" created successfully`, name },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create snapshot' },
      { status: 500 }
    );
  }
}
