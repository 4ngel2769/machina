import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// DELETE /api/vms/[id]/snapshots/[snapshotName] - Delete a snapshot
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotName: string }> }
) {
  const resolvedParams = await params;
  const { id: vmName, snapshotName } = resolvedParams;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    // Delete the snapshot
    execSync(`virsh snapshot-delete ${vmName} ${snapshotName}`, {
      encoding: 'utf-8',
    });

    return NextResponse.json({
      message: `Snapshot "${snapshotName}" deleted successfully`,
    });
  } catch (error) {
    console.error('Error deleting snapshot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete snapshot' },
      { status: 500 }
    );
  }
}
