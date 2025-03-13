import { NextRequest, NextResponse } from 'next/server';
import { getVMDisplayConfig } from '@/lib/libvirt';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const vmName = decodeURIComponent(params.id);
    const displayConfig = getVMDisplayConfig(vmName);

    if (!displayConfig) {
      return NextResponse.json(
        { error: 'No display configuration found' },
        { status: 404 }
      );
    }

    return NextResponse.json(displayConfig);
  } catch (error) {
    console.error('Error fetching display config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch display configuration' },
      { status: 500 }
    );
  }
}
