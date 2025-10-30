import { NextRequest, NextResponse } from 'next/server';
import {
  listContainers,
  createContainer,
  isDockerAvailable,
} from '@/lib/docker';
import { Container, ContainerStatus, CreateContainerRequest } from '@/types/container';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import {
  attachOwnershipInfo,
  filterResourcesByUser,
} from '@/lib/resource-ownership';

// Validation schema for container creation
const createContainerSchema = z.object({
  name: z.string().optional(),
  image: z.string().min(1, 'Image is required'),
  type: z.enum(['normal', 'amnesic']),
  shell: z.string().min(1, 'Shell is required'),
  ports: z
    .array(
      z.object({
        container: z.number(),
        host: z.number(),
        protocol: z.string(),
      })
    )
    .optional(),
  env: z.record(z.string()).optional(),
});

/**
 * GET /api/containers - List all containers
 */
export async function GET() {
  try {
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

    return NextResponse.json({
      success: true,
      data: containers,
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

    // Create the container
    const container = await createContainer(config);

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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create container',
      },
      { status: 500 }
    );
  }
}
