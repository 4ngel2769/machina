import { NextRequest, NextResponse } from 'next/server';
import { stopContainer, isDockerAvailable } from '@/lib/docker';

/**
 * POST /api/containers/[id]/stop - Stop a container
 */
export async function POST(
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

    await stopContainer(id);

    return NextResponse.json({
      success: true,
      message: 'Container stopped successfully',
    });
  } catch (error) {
    console.error('Error stopping container:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to stop container',
      },
      { status: 500 }
    );
  }
}
