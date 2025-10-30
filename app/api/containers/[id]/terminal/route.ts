import { NextRequest, NextResponse } from 'next/server';
import { getDockerClient, isDockerAvailable } from '@/lib/docker';

/**
 * GET /api/containers/[id]/terminal - WebSocket terminal connection
 * 
 * Note: This is a simplified implementation. For production WebSocket support,
 * consider using a custom server or external WebSocket service.
 * Next.js App Router has limited WebSocket support.
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

    // Check if this is a WebSocket upgrade request
    const upgrade = request.headers.get('upgrade');
    if (upgrade !== 'websocket') {
      return NextResponse.json(
        {
          success: false,
          error: 'This endpoint requires WebSocket connection',
          info: 'Set Upgrade: websocket header',
        },
        { status: 426 } // Upgrade Required
      );
    }

    // For now, return connection info
    // In production, implement WebSocket upgrade here or use custom server
    return NextResponse.json({
      success: true,
      message: 'Terminal endpoint ready',
      containerId: id,
      note: 'WebSocket upgrade required - use custom server implementation for production',
    });
  } catch (error) {
    console.error('Error in terminal endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Terminal connection failed',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/containers/[id]/terminal - Execute command in container
 * Alternative to WebSocket for simple command execution
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { command } = body;

    if (!command) {
      return NextResponse.json(
        { success: false, error: 'Command is required' },
        { status: 400 }
      );
    }

    const dockerAvailable = await isDockerAvailable();
    if (!dockerAvailable) {
      return NextResponse.json(
        { success: false, error: 'Docker daemon is not running' },
        { status: 503 }
      );
    }

    const docker = getDockerClient();
    const container = docker.getContainer(id);

    // Execute command
    const exec = await container.exec({
      Cmd: ['/bin/sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: false, stdin: false });
    
    // Collect output
    let output = '';
    stream.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf-8');
    });

    await new Promise((resolve) => {
      stream.on('end', resolve);
    });

    return NextResponse.json({
      success: true,
      data: {
        output: output.trim(),
      },
    });
  } catch (error) {
    console.error('Error executing command:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
      },
      { status: 500 }
    );
  }
}
