import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listVMs } from '@/lib/libvirt';

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

    // Get all VMs and filter by userId
    // Note: In a real implementation, you'd store userId with each VM
    // For now, we'll return an empty array as a placeholder
    const allVMs = listVMs();
    const userVMs = allVMs.filter((vm) => {
      // TODO: Filter by userId when VM ownership tracking is implemented
      return false; // Placeholder
    });

    return NextResponse.json({ vms: userVMs });
  } catch (error) {
    console.error('Error fetching user VMs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
