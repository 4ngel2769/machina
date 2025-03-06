import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// POST /api/vms/[name]/snapshots/[snapshotName]/revert - Revert to a snapshot
export async function POST(
  _request: NextRequest,
  { params }: { params: { name: string; snapshotName: string } }
) {
  const { name: vmName, snapshotName } = params;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    // Revert to the snapshot
    execSync(`virsh snapshot-revert ${vmName} ${snapshotName}`, {
      encoding: 'utf-8',
    });

    return NextResponse.json({
      message: `Reverted to snapshot "${snapshotName}" successfully`,
    });
  } catch (error) {
    console.error('Error reverting to snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revert to snapshot' },
      { status: 500 }
    );
  }
}
