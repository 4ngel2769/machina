import { NextRequest, NextResponse } from 'next/server';
import { getVMDisplayConfig } from '@/lib/libvirt';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vmName = decodeURIComponent(id);
    const displayConfig = getVMDisplayConfig(vmName);

    if (!displayConfig) {
      return NextResponse.json(
        { error: 'No display configuration found' },
        { status: 404 }
      );
    }

    // Replace internal IPs with public host for remote access
    const publicHost = process.env.PUBLIC_HOST || 'localhost';
    
    const processedConfig = {
      vnc: displayConfig.vnc ? {
        ...displayConfig.vnc,
        // Replace 0.0.0.0 or 127.0.0.1 with public host for client connections
        host: publicHost,
        // Keep the original listen for internal use
        listen: displayConfig.vnc.listen
      } : undefined,
      spice: displayConfig.spice ? {
        ...displayConfig.spice,
        // Replace 0.0.0.0 or 127.0.0.1 with public host for client connections
        host: publicHost,
        // Keep the original listen for internal use
        listen: displayConfig.spice.listen
      } : undefined
    };

    return NextResponse.json(processedConfig);
  } catch (error) {
    console.error('Error fetching display config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch display configuration' },
      { status: 500 }
    );
  }
}
