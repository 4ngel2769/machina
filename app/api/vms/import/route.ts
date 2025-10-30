import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { isLibvirtAvailable } from '@/lib/libvirt';

// POST /api/vms/import - Import VM from XML
export async function POST(request: NextRequest) {
  if (!isLibvirtAvailable()) {
    return NextResponse.json(
      { error: 'libvirt is not available' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { xml, name } = body;

    if (!xml || !name) {
      return NextResponse.json(
        { error: 'XML content and name are required' },
        { status: 400 }
      );
    }

    // Replace the VM name in XML
    let updatedXML = xml;
    const nameMatch = xml.match(/<name>[^<]+<\/name>/);
    if (nameMatch) {
      updatedXML = xml.replace(/<name>[^<]+<\/name>/, `<name>${name}</name>`);
    } else {
      // If no name tag found, add one after <domain>
      updatedXML = xml.replace(/(<domain[^>]*>)/, `$1\n  <name>${name}</name>`);
    }

    // Remove UUID to let libvirt generate a new one
    updatedXML = updatedXML.replace(/<uuid>[^<]+<\/uuid>/, '');

    // Write to temporary file
    const tempFile = join(tmpdir(), `import-${name}-${Date.now()}.xml`);
    writeFileSync(tempFile, updatedXML, 'utf-8');

    try {
      // Define the VM
      execSync(`virsh define ${tempFile}`, { encoding: 'utf-8' });

      return NextResponse.json({
        message: `VM "${name}" imported successfully`,
        name,
        note: 'Make sure disk image paths in the XML are valid on this system',
      });
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error importing VM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import VM' },
      { status: 500 }
    );
  }
}
