import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { listVMs } from '@/lib/libvirt';
import { attachOwnershipInfo, filterResourcesByOwner } from '@/lib/resource-ownership';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const { id } = await params;

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all VMs and filter by userId
    const allVMs = listVMs();
    const vmsWithOwnership = attachOwnershipInfo(allVMs, 'vm');
    const userVMs = filterResourcesByOwner(vmsWithOwnership, id);

    return NextResponse.json({ vms: userVMs });
  } catch (error) {
    console.error('Error fetching user VMs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
