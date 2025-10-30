import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// POST /api/vms/[id]/export - Export VM configuration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: name } = await params;
  const vmName = name;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { format = 'xml' } = body;

    // Get VM XML
    const xml = execSync(`virsh dumpxml ${vmName}`, { encoding: 'utf-8' });

    // Extract disk paths from XML
    const diskPaths: string[] = [];
    const diskMatches = xml.matchAll(/source file=['"]([^'"]+)['"]/g);
    for (const match of diskMatches) {
      diskPaths.push(match[1]);
    }

    if (format === 'ova') {
      return NextResponse.json(
        { error: 'OVA export not yet implemented' },
        { status: 501 }
      );
    }

    return NextResponse.json({
      xml,
      disks: diskPaths,
      message: 'VM configuration exported successfully',
      note: 'Disk images must be copied manually from their locations',
    });
  } catch (error) {
    console.error('Error exporting VM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export VM' },
      { status: 500 }
    );
  }
}
