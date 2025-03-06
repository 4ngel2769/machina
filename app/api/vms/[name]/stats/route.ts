import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';

// GET /api/vms/[name]/stats - Get VM performance statistics
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
    // Get domain statistics using virsh domstats
    const output = execSync(`virsh domstats ${vmName}`, {
      encoding: 'utf-8',
    });

    // Parse the output
    const stats: Record<string, string | number> = {};
    output.split('\n').forEach((line) => {
      const match = line.match(/^\s*(\S+)=(.+)$/);
      if (match) {
        const [, key, value] = match;
        stats[key] = isNaN(Number(value)) ? value : Number(value);
      }
    });

    // Extract key metrics
    const cpuTime = Number(stats['cpu.time'] || 0);
    const cpuUsage = Number(stats['cpu.usage'] || 0); // Percentage if available
    
    const memoryTotal = Number(stats['balloon.maximum'] || stats['memory.maximum'] || 0);
    const memoryUsage = Number(stats['balloon.current'] || stats['memory.current'] || 0);
    
    const diskReadBytes = Number(stats['block.0.rd.bytes'] || 0);
    const diskWriteBytes = Number(stats['block.0.wr.bytes'] || 0);
    
    const networkRxBytes = Number(stats['net.0.rx.bytes'] || 0);
    const networkTxBytes = Number(stats['net.0.tx.bytes'] || 0);

    return NextResponse.json({
      cpuTime,
      cpuUsage,
      memoryTotal,
      memoryUsage,
      diskReadBytes,
      diskWriteBytes,
      networkRxBytes,
      networkTxBytes,
      rawStats: stats, // Include raw stats for debugging
    });
  } catch (error) {
    console.error('Error fetching VM stats:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch VM stats' },
      { status: 500 }
    );
  }
}
