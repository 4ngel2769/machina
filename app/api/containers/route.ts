import { NextRequest, NextResponse } from 'next/server';
import {
  listContainers,
  createContainer,
  isDockerAvailable,
} from '@/lib/docker';
import { Container, ContainerStatus, CreateContainerRequest } from '@/types/container';
import { auth } from '@/lib/auth/config';
import {
  attachOwnershipInfo,
  filterResourcesByUser,
} from '@/lib/resource-ownership';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';
import { createContainerSchema } from '@/lib/validation';
import { checkContainerQuota } from '@/lib/quota-system';
import { logActivity } from '@/lib/activity-logger';

/**
 * GET /api/containers - List all containers
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limiting
    const rateLimitResult = await rateLimit(
      request,
      getRateLimitIdentifier(request, session.user.id),
      'api'
    );
    if (rateLimitResult) return rateLimitResult;

    // Check if Docker is available
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: 'Docker daemon is not running or unreachable',
          data: [],
        },
        { status: 503 }
      );
    }

    // Fetch containers from Docker
    const dockerContainers = await listContainers(true);

    // Transform Docker containers to our Container type
    const containers: Container[] = dockerContainers.map((dc) => {
      const status = dc.State.toLowerCase() as ContainerStatus;
      const name = dc.Names[0]?.replace(/^\//, '') || 'unknown';
      
      // Calculate uptime if running
      let uptime: string | undefined;
      if (status === 'running' && dc.Status) {
        uptime = dc.Status;
      }

      // Parse ports
      const ports =
        dc.Ports?.map((p) => ({
          container: p.PrivatePort,
          host: p.PublicPort || 0,
          protocol: p.Type,
        })) || [];

      // Determine container type - default to normal for now
      // AutoRemove is not available in list response, would need full inspect
      const type: 'normal' | 'amnesic' = 'normal';

      return {
        id: dc.Id,
        name,
        image: dc.Image,
        status,
        created: new Date(dc.Created * 1000),
        ports,
        type,
        uptime,
        state: {
          startedAt: dc.State === 'running' ? new Date() : undefined,
        },
      };
    });

    // Attach ownership information
    const containersWithOwnership = attachOwnershipInfo(containers, 'container');

    // Filter by user permissions (admins see all, users see only theirs)
    const filteredContainers = filterResourcesByUser(
      containersWithOwnership,
      'container',
      session.user.id,
      session.user.role
    );

    return NextResponse.json({
      success: true,
      data: filteredContainers,
    });
  } catch (error) {
    console.error('Error in GET /api/containers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch containers',
        data: [],
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/containers - Create a new container
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Rate limiting (stricter for creation)
    const rateLimitResult = await rateLimit(
      request,
      getRateLimitIdentifier(request, session.user.id),
      'create'
    );
    if (rateLimitResult) return rateLimitResult;

    // Check if Docker is available
    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: 'Docker daemon is not running or unreachable',
        },
        { status: 503 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validationResult = createContainerSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const config: CreateContainerRequest = validationResult.data;

    // Check quota before creating container
    const quotaCheck = await checkContainerQuota(
      session.user.id,
      session.user.role === 'admin'
    );
    
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Quota exceeded',
          reason: quotaCheck.reason,
          currentUsage: quotaCheck.currentUsage,
          quotas: quotaCheck.quotas
        },
        { status: 403 }
      );
    }

    // Create the container
    const container = await createContainer(config);

    // Store ownership information
    const { addResourceOwnership } = await import('@/lib/resource-ownership');
    addResourceOwnership(container.id, 'container', session.user.id);

    // Log activity
    logActivity({
      userId: session.user.id,
      username: session.user.name || session.user.email || 'unknown',
      action: 'container.created',
      resourceType: 'container',
      resourceId: container.id,
      resourceName: config.name || container.id.substring(0, 12),
      details: {
        image: config.image,
        type: config.type,
      },
      success: true,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: container.id,
          message: 'Container created successfully',
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in POST /api/containers:', error);
    
    // Log failed attempt
    const session = await auth();
    if (session?.user) {
      logActivity({
        userId: session.user.id,
        username: session.user.name || session.user.email || 'unknown',
        action: 'container.created',
        resourceType: 'container',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create container',
      },
      { status: 500 }
    );
  }
}
