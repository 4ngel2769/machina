import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listContainers } from '@/lib/docker';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all containers and filter by userId
    // Note: In a real implementation, you'd store userId with each container
    // For now, we'll return an empty array as a placeholder
    const allContainers = await listContainers();
    const userContainers = allContainers.filter((_container) => {
      // TODO: Filter by userId when container ownership tracking is implemented
      return false; // Placeholder
    });

    return NextResponse.json({ containers: userContainers });
  } catch (error) {
    console.error('Error fetching user containers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
