import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, listStoragePools } from '@/lib/libvirt';
import { execSync } from 'child_process';
import { z } from 'zod';

// Validation schema for storage pool creation
const createPoolSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Pool name must be alphanumeric with hyphens or underscores'),
  type: z.enum(['dir', 'disk', 'logical', 'netfs', 'iscsi']).default('dir'),
  path: z.string().min(1),
});

// GET /api/storage/pools - List all storage pools
export async function GET() {
  try {
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const pools = listStoragePools();
    
    return NextResponse.json({
      pools,
      count: pools.length,
    });
  } catch (error) {
    console.error('Error listing storage pools:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list storage pools' },
      { status: 500 }
    );
  }
}

// POST /api/storage/pools - Create new storage pool
export async function POST(request: NextRequest) {
  try {
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    
    // Validate request body
    const validatedData = createPoolSchema.parse(body);
    
    // Create pool XML
    const poolXML = `
<pool type='${validatedData.type}'>
  <name>${validatedData.name}</name>
  <target>
    <path>${validatedData.path}</path>
  </target>
</pool>
    `.trim();
    
    // Save XML to temp file and create pool
    try {
      // Define the pool
      execSync(`echo '${poolXML.replace(/'/g, "'\\''")}' | virsh pool-define /dev/stdin`, {
        encoding: 'utf-8',
      });
      
      // Build the pool (creates directory if needed)
      execSync(`virsh pool-build ${validatedData.name}`, {
        encoding: 'utf-8',
      });
      
      // Start the pool
      execSync(`virsh pool-start ${validatedData.name}`, {
        encoding: 'utf-8',
      });
      
      // Set autostart
      execSync(`virsh pool-autostart ${validatedData.name}`, {
        encoding: 'utf-8',
      });
      
      return NextResponse.json({
        message: `Storage pool '${validatedData.name}' created successfully`,
        pool: {
          name: validatedData.name,
          type: validatedData.type,
          path: validatedData.path,
        },
      }, { status: 201 });
    } catch (error) {
      throw new Error(`Failed to create storage pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating storage pool:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create storage pool' },
      { status: 500 }
    );
  }
}
