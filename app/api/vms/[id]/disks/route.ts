import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// GET /api/vms/[id]/disks - List all disks for a VM
export async function GET(
  _request: NextRequest,
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
    // Get VM XML
    const xml = execSync(`virsh dumpxml ${vmName}`, { encoding: 'utf-8' });

    // Parse disk information from XML
    const disks: Array<{
      path: string;
      size: string;
      format: string;
      target: string;
    }> = [];

    // Match disk elements
    const diskRegex = /<disk[\s\S]*?<\/disk>/g;
    const diskMatches = xml.match(diskRegex) || [];

    for (const diskXml of diskMatches) {
      // Only process 'file' type disks (not CDROMs, etc.)
      if (!diskXml.includes("device='disk'")) continue;

      // Extract source file path
      const sourceMatch = diskXml.match(/source file=['"]([^'"]+)['"]/);
      if (!sourceMatch) continue;
      const path = sourceMatch[1];

      // Extract target device
      const targetMatch = diskXml.match(/target dev=['"]([^'"]+)['"]/);
      const target = targetMatch ? targetMatch[1] : 'unknown';

      // Extract format
      const formatMatch = diskXml.match(/driver.*type=['"]([^'"]+)['"]/);
      const format = formatMatch ? formatMatch[1] : 'unknown';

      // Get disk size using qemu-img
      let size = 'unknown';
      try {
        const info = execSync(`qemu-img info ${path}`, { encoding: 'utf-8' });
        const sizeMatch = info.match(/virtual size: ([^\n(]+)/);
        if (sizeMatch) {
          size = sizeMatch[1].trim();
        }
      } catch (error) {
        console.error(`Error getting size for ${path}:`, error);
      }

      disks.push({ path, size, format, target });
    }

    return NextResponse.json({ disks });
  } catch (error) {
    console.error('Error listing disks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list disks' },
      { status: 500 }
    );
  }
}
