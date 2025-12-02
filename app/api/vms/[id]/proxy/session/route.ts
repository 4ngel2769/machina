import { NextRequest, NextResponse } from 'next/server';

function buildSessionPayload(vmName: string, session: { token: string; expiresAt: Date }) {
  const encodedVm = encodeURIComponent(vmName);
  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    wsPath: `/api/vms/${encodedVm}/console/ws?token=${session.token}`,
    popupUrl: `/vms/${encodedVm}/console?popup=1&session=${session.token}`,
  };
}

async function getProxyManager() {
  return (await import('@/lib/proxy-manager.cjs')).default;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vmName = decodeURIComponent(id);

    const proxyManager = await getProxyManager();
    const proxy = proxyManager.getProxy(vmName);

    if (!proxy) {
      return NextResponse.json(
        { error: 'No active proxy for this VM' },
        { status: 404 }
      );
    }

    const session = proxyManager.createSession(vmName);

    return NextResponse.json({
      success: true,
      session: buildSessionPayload(vmName, session),
    });
  } catch (error) {
    console.error('[Proxy Session API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to issue VNC session' },
      { status: 500 }
    );
  }
}
