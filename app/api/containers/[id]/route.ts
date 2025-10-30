import { NextRequest, NextResponse } from 'next/server';
import { getContainerInfo, removeContainer, isDockerAvailable } from '@/lib/docker';

/**
 * GET /api/containers/[id] - Get container details
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

    const info = await getContainerInfo(id);

    return NextResponse.json({
      success: true,
      data: info,
    });
  } catch (error) {
    console.error('Error getting container info:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get container info',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/containers/[id] - Remove a container
 */
export async function DELETE(
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

    // Get force parameter from query
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    await removeContainer(id, force);

    return NextResponse.json({
      success: true,
      message: 'Container removed successfully',
    });
  } catch (error) {
    console.error('Error removing container:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove container',
      },
      { status: 500 }
    );
  }
}
