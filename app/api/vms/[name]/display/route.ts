import { NextRequest, NextResponse } from 'next/server';
import { getVMDisplayConfig } from '@/lib/libvirt';

export async function GET(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  try {
    const vmName = decodeURIComponent(params.name);
    
    const displayConfig = getVMDisplayConfig(vmName);
    
    if (!displayConfig) {
      return NextResponse.json(
        { error: 'No display configuration found for this VM' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(displayConfig);
  } catch (error) {
    console.error('Error fetching VM display config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get display configuration' },
      { status: 500 }
    );
  }
}
