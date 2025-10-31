import { NextRequest, NextResponse } from 'next/server';
import { getContainerInfo, removeContainer, isDockerAvailable } from '@/lib/docker';
import { auth } from '@/lib/auth/config';
import { canUserAccessResource, removeResourceOwnership } from '@/lib/resource-ownership';
import { ContainerStatus } from '@/types/container';

/**
 * GET /api/containers/[id] - Get container details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions
    if (!canUserAccessResource(id, 'container', session.user.id, session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have access to this container' },
        { status: 403 }
      );
    }

    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return NextResponse.json(
        { success: false, error: 'Docker daemon is not running' },
        { status: 503 }
      );
    }

    const info = await getContainerInfo(id);

    // Ensure we have valid container info
    if (!info || typeof info !== 'object') {
      return NextResponse.json(
        { error: 'Invalid container data received from Docker' },
        { status: 500 }
      );
    }

    // Transform Docker inspect result to our Container type
    const rawStatus = info.State?.Status || 'unknown';
    const status = (typeof rawStatus === 'string' ? rawStatus.toLowerCase() : 'unknown') as ContainerStatus;
    const name = (info.Name || 'unknown').toString().replace(/^\//, '');

    // Calculate uptime if running
    let uptime: string | undefined;
    if (status === 'running' && info.State?.StartedAt) {
      uptime = info.State.Status; // Use the status string which includes uptime
    }

    // Parse ports from NetworkSettings
    const ports: Array<{ container: number; host: number; protocol: string }> = [];

    // For now, we'll skip detailed port parsing as it requires more complex logic
    // The ports will be populated from the container list if needed

    // Determine container type
    const type: 'normal' | 'amnesic' = info.HostConfig?.AutoRemove ? 'amnesic' : 'normal';

    const container = {
      id: String(info.Id || id),
      name,
      image: info.Config?.Image || info.Image || 'unknown',
      status,
      created: info.Created ? new Date(info.Created) : new Date(),
      ports,
      type,
      uptime,
      state: {
        startedAt: info.State?.StartedAt ? new Date(info.State.StartedAt) : undefined,
      },
    };

    return NextResponse.json({
      success: true,
      data: container,
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

    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check permissions
    if (!canUserAccessResource(id, 'container', session.user.id, session.user.role)) {
      return NextResponse.json(
        { error: 'Forbidden - You do not have access to this container' },
        { status: 403 }
      );
    }

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

    // Remove ownership metadata
    removeResourceOwnership(id, 'container');

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
