import { NextRequest, NextResponse } from 'next/server';
import { getVNCPort, startWebsockifyProxy, stopWebsockifyProxy } from '@/lib/vnc';
import { isLibvirtAvailable } from '@/lib/libvirt';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: name } = await params;
    
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'libvirt is not available' },
        { status: 503 }
      );
    }

    // Get VNC port for the VM
    const vncPort = getVNCPort(name);
    
    if (!vncPort) {
      return NextResponse.json(
        { error: 'VNC not configured for this VM' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      vmName: name,
      vncPort,
      vncHost: 'localhost',
    });
  } catch (error) {
    console.error('Failed to get VNC info:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VNC info' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: name } = await params;
    
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'libvirt is not available' },
        { status: 503 }
      );
    }

    // Get VNC port
    const vncPort = getVNCPort(name);
    
    if (!vncPort) {
      return NextResponse.json(
        { error: 'VNC not configured for this VM' },
        { status: 404 }
      );
    }

    // Start websockify proxy
    const { wsUrl, wsPort, proxyId } = await startWebsockifyProxy(name, vncPort);

    return NextResponse.json({
      wsUrl,
      wsPort,
      proxyId,
      vncPort,
      message: 'Websockify proxy started',
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to start VNC proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start VNC proxy' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    
    const success = stopWebsockifyProxy(name);
    
    if (!success) {
      return NextResponse.json(
        { error: 'No active proxy found for this VM' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: 'Websockify proxy stopped',
    });
  } catch (error) {
    console.error('Failed to stop VNC proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop VNC proxy' },
      { status: 500 }
    );
  }
}
