import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { listContainers } from '@/lib/docker';
import { attachOwnershipInfo } from '@/lib/resource-ownership';

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

    // Get all containers and filter by userId
    const allContainers = await listContainers();
    // Map containers to have lowercase 'id' field for ownership tracking
    const containersMapped = allContainers.map(c => ({ ...c, id: c.Id }));
    const containersWithOwnership = attachOwnershipInfo(containersMapped, 'container');
    const userContainers = containersWithOwnership.filter(container => container.createdBy === id);

    return NextResponse.json({ containers: userContainers });
  } catch (error) {
    console.error('Error fetching user containers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
