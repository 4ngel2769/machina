import { NextResponse } from 'next/server';
import { getDockerClient } from '@/lib/docker';
import type { ContainerStats } from '@/types/stats';
import type { ContainerInfo } from 'dockerode';

export async function GET() {
  try {
    const docker = getDockerClient();

    const containers = await docker.listContainers({ all: false }); // Only running containers
    const statsPromises = containers.map(async (containerInfo: ContainerInfo) => {
      try {
        const container = docker.getContainer(containerInfo.Id);
        const stats = await container.stats({ stream: false });

        // Calculate CPU percentage
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

        // Calculate memory percentage
        const memoryUsage = stats.memory_stats.usage || 0;
        const memoryLimit = stats.memory_stats.limit || 0;
        const memoryPercent = memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

        // Network stats
        let rx = 0;
        let tx = 0;
        if (stats.networks) {
          Object.values(stats.networks).forEach((network: unknown) => {
            const net = network as { rx_bytes?: number; tx_bytes?: number };
            rx += net.rx_bytes || 0;
            tx += net.tx_bytes || 0;
          });
        }

        // Block I/O stats
        let blockRead = 0;
        let blockWrite = 0;
        if (stats.blkio_stats?.io_service_bytes_recursive) {
          stats.blkio_stats.io_service_bytes_recursive.forEach((item: { op: string; value: number }) => {
            if (item.op === 'read') blockRead += item.value;
            if (item.op === 'write') blockWrite += item.value;
          });
        }

        const containerStat: ContainerStats = {
          id: containerInfo.Id.substring(0, 12),
          name: containerInfo.Names[0].replace(/^\//, ''),
          cpu: Math.round(cpuPercent * 10) / 10,
          memory: {
            usage: memoryUsage,
            limit: memoryLimit,
            percentage: Math.round(memoryPercent * 10) / 10,
          },
          network: {
            rx,
            tx,
          },
          blockIO: {
            read: blockRead,
            write: blockWrite,
          },
        };

        return containerStat;
      } catch (error) {
        console.error(`Error getting stats for container ${containerInfo.Id}:`, error);
        return null;
      }
    });

    const stats = (await Promise.all(statsPromises)).filter((stat: ContainerStats | null): stat is ContainerStats => stat !== null);

    return NextResponse.json({ containers: stats });
  } catch (error) {
    console.error('Error getting container stats:', error);
    return NextResponse.json(
      { error: 'Failed to get container stats' },
      { status: 500 }
    );
  }
}
