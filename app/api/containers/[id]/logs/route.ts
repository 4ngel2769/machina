import { NextRequest, NextResponse } from 'next/server';
import { getContainerLogs, isDockerAvailable } from '@/lib/docker';

/**
 * GET /api/containers/[id]/logs - Get container logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return NextResponse.json(
        { success: false, error: 'Docker daemon is not running' },
        { status: 503 }
      );
    }

    // Get tail parameter from query
    const { searchParams } = new URL(request.url);
    const tail = parseInt(searchParams.get('tail') || '100', 10);

    const logs = await getContainerLogs(id, tail);
    
    // Convert buffer to string
    const logsString = logs.toString('utf-8');

    return NextResponse.json({
      success: true,
      data: {
        logs: logsString,
      },
    });
  } catch (error) {
    console.error('Error getting container logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get container logs',
      },
      { status: 500 }
    );
  }
}
