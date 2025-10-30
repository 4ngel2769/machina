import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isLibvirtAvailable } from '@/lib/libvirt';

// GET /api/vms/[name]/xml - Get VM XML configuration
export async function GET(
  _request: NextRequest,
  { params }: { params: { name: string } }
) {
  const vmName = params.name;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    // Get the VM XML using virsh dumpxml
    const xml = execSync(`virsh dumpxml ${vmName}`, {
      encoding: 'utf-8',
    });

    return NextResponse.json({ xml });
  } catch (error) {
    console.error('Error getting VM XML:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VM XML' },
      { status: 500 }
    );
  }
}

// PUT /api/vms/[name]/xml - Update VM XML configuration
export async function PUT(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const vmName = params.name;

  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { xml } = body;

    if (!xml) {
      return NextResponse.json(
        { error: 'XML content is required' },
        { status: 400 }
      );
    }

    // Write XML to temporary file
    const tempFile = join(tmpdir(), `${vmName}-${Date.now()}.xml`);
    writeFileSync(tempFile, xml, 'utf-8');

    try {
      // Undefine the existing VM
      execSync(`virsh undefine ${vmName}`, { encoding: 'utf-8' });

      // Define the VM with the new XML
      execSync(`virsh define ${tempFile}`, { encoding: 'utf-8' });

      return NextResponse.json({
        message: 'VM configuration updated successfully',
      });
    } finally {
      // Clean up temporary file
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error updating VM XML:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VM XML' },
      { status: 500 }
    );
  }
}
