import { NextRequest, NextResponse } from 'next/server';
import { isLibvirtAvailable, listNetworks } from '@/lib/libvirt';
import { execSync } from 'child_process';
import { z } from 'zod';
import { validateIPRange } from '@/lib/vm-helpers';

// Validation schema for network creation
const createNetworkSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Network name must be alphanumeric with hyphens or underscores'),
  mode: z.enum(['nat', 'bridge', 'isolated']).default('nat'),
  bridge: z.string().optional(),
  ip_range: z.string().optional(),
  dhcp_enabled: z.boolean().default(true),
}).refine((data) => {
  // If IP range is provided, validate it
  if (data.ip_range && !validateIPRange(data.ip_range)) {
    return false;
  }
  return true;
}, {
  message: 'Invalid IP range format. Use CIDR notation (e.g., 192.168.122.0/24)',
});

// GET /api/networks - List all virtual networks
export async function GET() {
  try {
    // Check if libvirt is available
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'Libvirt is not available. Please ensure libvirt/QEMU/KVM is installed.' },
        { status: 503 }
      );
    }

    const networks = listNetworks();
    
    return NextResponse.json({
      networks,
      count: networks.length,
    });
  } catch (error) {
    console.error('Error listing networks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list networks' },
      { status: 500 }
    );
  }
}

// POST /api/networks - Create new virtual network
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
    const validatedData = createNetworkSchema.parse(body);
    
    // Generate bridge name if not provided
    const bridgeName = validatedData.bridge || `virbr-${validatedData.name}`;
    
    // Parse IP range
    let networkIP = '192.168.100.0';
    let netmask = '255.255.255.0';
    let dhcpStart = '192.168.100.2';
    let dhcpEnd = '192.168.100.254';
    
    if (validatedData.ip_range) {
      const [ip, cidr] = validatedData.ip_range.split('/');
      const cidrNum = parseInt(cidr);
      networkIP = ip;
      
      // Calculate netmask from CIDR
      const mask = ~((1 << (32 - cidrNum)) - 1);
      netmask = [
        (mask >>> 24) & 0xff,
        (mask >>> 16) & 0xff,
        (mask >>> 8) & 0xff,
        mask & 0xff,
      ].join('.');
      
      // Calculate DHCP range
      const ipParts = ip.split('.').map(Number);
      dhcpStart = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.2`;
      dhcpEnd = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.254`;
    }
    
    // Create network XML based on mode
    let networkXML = '';
    
    if (validatedData.mode === 'nat') {
      networkXML = `
<network>
  <name>${validatedData.name}</name>
  <forward mode='nat'/>
  <bridge name='${bridgeName}' stp='on' delay='0'/>
  <ip address='${networkIP}' netmask='${netmask}'>
    ${validatedData.dhcp_enabled ? `
    <dhcp>
      <range start='${dhcpStart}' end='${dhcpEnd}'/>
    </dhcp>
    ` : ''}
  </ip>
</network>
      `.trim();
    } else if (validatedData.mode === 'bridge') {
      networkXML = `
<network>
  <name>${validatedData.name}</name>
  <forward mode='bridge'/>
  <bridge name='${bridgeName}'/>
</network>
      `.trim();
    } else if (validatedData.mode === 'isolated') {
      networkXML = `
<network>
  <name>${validatedData.name}</name>
  <bridge name='${bridgeName}' stp='on' delay='0'/>
  <ip address='${networkIP}' netmask='${netmask}'>
    ${validatedData.dhcp_enabled ? `
    <dhcp>
      <range start='${dhcpStart}' end='${dhcpEnd}'/>
    </dhcp>
    ` : ''}
  </ip>
</network>
      `.trim();
    }
    
    // Create network using virsh
    try {
      // Define the network
      execSync(`echo '${networkXML.replace(/'/g, "'\\''")}' | virsh net-define /dev/stdin`, {
        encoding: 'utf-8',
      });
      
      // Start the network
      execSync(`virsh net-start ${validatedData.name}`, {
        encoding: 'utf-8',
      });
      
      // Set autostart
      execSync(`virsh net-autostart ${validatedData.name}`, {
        encoding: 'utf-8',
      });
      
      return NextResponse.json({
        message: `Virtual network '${validatedData.name}' created successfully`,
        network: {
          name: validatedData.name,
          mode: validatedData.mode,
          bridge: bridgeName,
        },
      }, { status: 201 });
    } catch (error) {
      throw new Error(`Failed to create network: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Error creating network:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create network' },
      { status: 500 }
    );
  }
}
