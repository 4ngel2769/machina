import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { isLibvirtAvailable } from '@/lib/libvirt';
import type { VMStats } from '@/types/stats';

// Cache for CPU time tracking (to calculate deltas)
interface CPUTimeCache {
  time: number;
  timestamp: number;
}

const cpuTimeCache = new Map<string, CPUTimeCache>();

export async function GET() {
  try {
    if (!isLibvirtAvailable()) {
      return NextResponse.json(
        { error: 'libvirt is not available' },
        { status: 503 }
      );
    }

    // Get list of all running VMs
    const output = execSync('virsh list --name', { encoding: 'utf-8' });
    const vmNames = output
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    const statsPromises = vmNames.map(async (name): Promise<VMStats | null> => {
      try {
        // Get domain stats
        const statsOutput = execSync(`virsh domstats ${name}`, { encoding: 'utf-8' });

        // Parse stats
        const stats: Record<string, string | number> = {};
        statsOutput.split('\n').forEach((line) => {
          const match = line.match(/^\s*(\S+)=(.+)$/);
          if (match) {
            const [, key, value] = match;
            const numValue = parseFloat(value);
            stats[key] = isNaN(numValue) ? value : numValue;
          }
        });

        // Get domain info for memory
        const infoOutput = execSync(`virsh dominfo ${name}`, { encoding: 'utf-8' });
        let maxMemory = 0;
        const maxMemMatch = infoOutput.match(/Max memory:\s+(\d+)/);
        if (maxMemMatch) {
          maxMemory = parseInt(maxMemMatch[1], 10);
        }

        // Calculate CPU usage percentage using time deltas
        const cpuTime = (stats['cpu.time'] as number) || 0; // in nanoseconds
        const vcpus = (stats['vcpu.maximum'] as number) || 1;
        const now = Date.now();
        
        let cpuUsage = 0;
        const cached = cpuTimeCache.get(name);
        
        if (cached && cpuTime > 0) {
          const timeDelta = (now - cached.timestamp) / 1000; // seconds
          const cpuTimeDelta = (cpuTime - cached.time) / 1e9; // convert ns to seconds
          
          if (timeDelta > 0) {
            // CPU usage = (CPU time used / real time passed) / number of vCPUs * 100
            cpuUsage = (cpuTimeDelta / timeDelta / vcpus) * 100;
            cpuUsage = Math.min(Math.max(cpuUsage, 0), 100); // clamp between 0-100
          }
        }
        
        // Update cache
        cpuTimeCache.set(name, { time: cpuTime, timestamp: now });

        // Memory stats (in KB)
        const memoryUsed = stats['balloon.current'] as number || 0;
        const memoryPercentage = maxMemory > 0 ? (memoryUsed / maxMemory) * 100 : 0;

        // Disk stats
        const diskRead = stats['block.0.rd.bytes'] as number || 0;
        const diskWrite = stats['block.0.wr.bytes'] as number || 0;

        // Network stats
        const networkRx = stats['net.0.rx.bytes'] as number || 0;
        const networkTx = stats['net.0.tx.bytes'] as number || 0;

        const vmStat: VMStats = {
          name,
          state: stats['state.state'] as string || 'unknown',
          cpu: {
            usage: Math.round(cpuUsage * 10) / 10,
            vcpus: vcpus as number,
          },
          memory: {
            total: maxMemory,
            used: memoryUsed as number,
            percentage: Math.round(memoryPercentage * 10) / 10,
          },
          disk: {
            read: diskRead as number,
            write: diskWrite as number,
          },
          network: {
            rx: networkRx as number,
            tx: networkTx as number,
          },
        };

        return vmStat;
      } catch (error) {
        console.error(`Error getting stats for VM ${name}:`, error);
        return null;
      }
    });

    const stats = (await Promise.all(statsPromises)).filter((stat: VMStats | null): stat is VMStats => stat !== null);

    return NextResponse.json({ vms: stats });
  } catch (error) {
    console.error('Error getting VM stats:', error);
    return NextResponse.json(
      { error: 'Failed to get VM stats' },
      { status: 500 }
    );
  }
}
