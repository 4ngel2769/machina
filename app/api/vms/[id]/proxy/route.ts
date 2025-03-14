import { NextRequest, NextResponse } from 'next/server';

// Helper to get proxy manager (dynamic import for CommonJS module)
async function getProxyManager() {
  return (await import('@/lib/proxy-manager.cjs')).default;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vmName = decodeURIComponent(id);

    const proxyManager = await getProxyManager();

    // Get existing proxy info
    const proxy = proxyManager.getProxy(vmName);
    
    if (proxy) {
      return NextResponse.json({
        active: true,
        wsPort: proxy.wsPort,
        vncPort: proxy.vncPort,
        wsUrl: `ws://localhost:${proxy.wsPort}`,
        uptime: Date.now() - proxy.startedAt.getTime()
      });
    }

    return NextResponse.json({
      active: false,
      message: 'No proxy running for this VM'
    });
  } catch (error) {
    console.error('[Proxy API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get proxy info' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vmName = decodeURIComponent(id);
    const body = await request.json();
    const { vncPort, listen = '127.0.0.1' } = body;

    if (!vncPort) {
      return NextResponse.json(
        { error: 'vncPort is required' },
        { status: 400 }
      );
    }

    const proxyManager = await getProxyManager();

    // Check if websockify is installed
    const hasWebsockify = await proxyManager.checkWebsockify();
    if (!hasWebsockify) {
      return NextResponse.json(
        { 
          error: 'websockify not installed',
          message: 'Please install websockify: sudo apt install websockify'
        },
        { status: 503 }
      );
    }

    // Start the proxy
    const wsPort = await proxyManager.startProxy(vmName, vncPort, listen);

    return NextResponse.json({
      success: true,
      wsPort,
      vncPort,
      wsUrl: `ws://localhost:${wsPort}`,
      message: `Proxy started on port ${wsPort}`
    });
  } catch (error) {
    console.error('[Proxy API] Error starting proxy:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start proxy',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vmName = decodeURIComponent(id);

    const proxyManager = await getProxyManager();

    // Stop the proxy
    const stopped = proxyManager.stopProxy(vmName);

    if (stopped) {
      return NextResponse.json({
        success: true,
        message: 'Proxy stopped'
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No proxy was running'
    });
  } catch (error) {
    console.error('[Proxy API] Error stopping proxy:', error);
    return NextResponse.json(
      { error: 'Failed to stop proxy' },
      { status: 500 }
    );
  }
}
