import { NextResponse } from 'next/server';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const container = docker.getContainer(id);

    // Get container stats (one-shot, not streaming)
    const stats = await container.stats({ stream: false });

    // Parse stats
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 1;
    const memoryPercent = (memoryUsage / memoryLimit) * 100;

    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      Object.values(stats.networks).forEach((network: { rx_bytes?: number; tx_bytes?: number }) => {
        networkRx += network.rx_bytes || 0;
        networkTx += network.tx_bytes || 0;
      });
    }

    const blockRead = stats.blkio_stats?.io_service_bytes_recursive?.find((io: { op: string; value: number }) => io.op === 'read')?.value || 0;
    const blockWrite = stats.blkio_stats?.io_service_bytes_recursive?.find((io: { op: string; value: number }) => io.op === 'write')?.value || 0;

    const pids = stats.pids_stats?.current || 0;

    return NextResponse.json({
      cpu_percent: cpuPercent,
      memory_usage: memoryUsage,
      memory_limit: memoryLimit,
      memory_percent: memoryPercent,
      network_rx: networkRx,
      network_tx: networkTx,
      block_read: blockRead,
      block_write: blockWrite,
      pids,
    });
  } catch (error) {
    console.error('Error fetching container stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch container stats' },
      { status: 500 }
    );
  }
}
