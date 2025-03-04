import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, listVMs, createVM } from '@/lib/libvirt';
import { z } from 'zod';

// Validation schema for VM creation
const createVMSchema = z.object({
  name: z.string().optional(),
  installation_medium: z.object({
    type: z.enum(['download', 'local', 'url', 'pxe']),
    source: z.string().optional(),
    os_variant: z.string().optional(),
  }),
  storage: z.object({
    pool: z.string().default('default'),
    size: z.number().min(1).max(1000), // GB
    format: z.enum(['qcow2', 'raw', 'vmdk']).default('qcow2'),
  }),
  memory: z.number().min(512).max(65536), // MB
  vcpus: z.number().min(1).max(32),
  network: z.object({
    type: z.enum(['network', 'bridge']).default('network'),
    source: z.string().default('default'),
  }).optional(),
});

// GET /api/vms - List all VMs
export async function GET() {
  try {
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const vms = listVMs();
    
    return NextResponse.json({
      vms,
      count: vms.length,
    });
  } catch (error) {
    console.error('Error listing VMs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list VMs' },
      { status: 500 }
    );
  }
}

// POST /api/vms - Create new VM
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
    const validatedData = createVMSchema.parse(body);
    
    // Create VM
    const result = createVM(validatedData);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: result.message,
      vm: {
        name: result.name,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating VM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    );
  }
}
