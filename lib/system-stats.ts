import si from 'systeminformation';
import type { HostStats, DiskMount } from '@/types/stats';

// Cache configuration
const CACHE_TTL = 2000; // 2 seconds in milliseconds

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class StatsCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const cache = new StatsCache();

// Network tracking for rate calculation
let lastNetworkStats: {
  rx: number;
  tx: number;
  timestamp: number;
} | null = null;

export async function getHostCPU(): Promise<{
  usage: number;
  cores: number;
  model: string;
}> {
  const cached = cache.get<{ usage: number; cores: number; model: string }>('cpu');
  if (cached) return cached;

  try {
    const [currentLoad, cpuInfo] = await Promise.all([
      si.currentLoad(),
      si.cpu(),
    ]);

    const data = {
      usage: Math.round(currentLoad.currentLoad * 10) / 10,
      cores: cpuInfo.cores,
      model: cpuInfo.brand,
    };

    cache.set('cpu', data);
    return data;
  } catch (error) {
    console.error('Error getting CPU stats:', error);
    return {
      usage: 0,
      cores: 0,
      model: 'Unknown',
    };
  }
}

export async function getHostMemory(): Promise<{
  total: number;
  used: number;
  free: number;
  percentage: number;
}> {
  const cached = cache.get<{ total: number; used: number; free: number; percentage: number }>('memory');
  if (cached) return cached;

  try {
    const mem = await si.mem();

    const data = {
      total: mem.total,
      used: mem.used,
      free: mem.free,
      percentage: Math.round((mem.used / mem.total) * 1000) / 10,
    };

    cache.set('memory', data);
    return data;
  } catch (error) {
    console.error('Error getting memory stats:', error);
    return {
      total: 0,
      used: 0,
      free: 0,
      percentage: 0,
    };
  }
}

export async function getHostDisk(): Promise<{
  total: number;
  used: number;
  free: number;
  percentage: number;
  mounts: DiskMount[];
}> {
  const cached = cache.get<{ total: number; used: number; free: number; percentage: number; mounts: DiskMount[] }>('disk');
  if (cached) return cached;

  try {
    const fsSize = await si.fsSize();

    // Aggregate totals
    let totalSize = 0;
    let totalUsed = 0;
    let totalAvailable = 0;

    const mounts: DiskMount[] = fsSize.map(fs => {
      totalSize += fs.size;
      totalUsed += fs.used;
      totalAvailable += fs.available;

      return {
        fs: fs.fs,
        type: fs.type,
        size: fs.size,
        used: fs.used,
        available: fs.available,
        use: fs.use,
        mount: fs.mount,
      };
    });

    const data = {
      total: totalSize,
      used: totalUsed,
      free: totalAvailable,
      percentage: totalSize > 0 ? Math.round((totalUsed / totalSize) * 1000) / 10 : 0,
      mounts,
    };

    cache.set('disk', data);
    return data;
  } catch (error) {
    console.error('Error getting disk stats:', error);
    return {
      total: 0,
      used: 0,
      free: 0,
      percentage: 0,
      mounts: [],
    };
  }
}

export async function getHostNetwork(): Promise<{
  rx: number;
  tx: number;
  rx_rate: number;
  tx_rate: number;
}> {
  try {
    const networkStats = await si.networkStats();

    // Get the default/primary network interface
    const primaryInterface = networkStats[0] || {
      rx_bytes: 0,
      tx_bytes: 0,
    };

    const now = Date.now();
    const rx = primaryInterface.rx_bytes;
    const tx = primaryInterface.tx_bytes;

    let rx_rate = 0;
    let tx_rate = 0;

    if (lastNetworkStats) {
      const timeDiff = (now - lastNetworkStats.timestamp) / 1000; // seconds
      if (timeDiff > 0) {
        rx_rate = Math.round((rx - lastNetworkStats.rx) / timeDiff);
        tx_rate = Math.round((tx - lastNetworkStats.tx) / timeDiff);
      }
    }

    lastNetworkStats = { rx, tx, timestamp: now };

    return {
      rx,
      tx,
      rx_rate: Math.max(0, rx_rate),
      tx_rate: Math.max(0, tx_rate),
    };
  } catch (error) {
    console.error('Error getting network stats:', error);
    return {
      rx: 0,
      tx: 0,
      rx_rate: 0,
      tx_rate: 0,
    };
  }
}

export async function getHostUptime(): Promise<number> {
  const cached = cache.get<number>('uptime');
  if (cached) return cached;

  try {
    const time = await si.time();
    cache.set('uptime', time.uptime);
    return time.uptime;
  } catch (error) {
    console.error('Error getting uptime:', error);
    return 0;
  }
}

export async function getHostInfo(): Promise<{
  platform: string;
  distro: string;
  release: string;
  kernel: string;
  arch: string;
}> {
  const cached = cache.get<{ platform: string; distro: string; release: string; kernel: string; arch: string }>('os');
  if (cached) return cached;

  try {
    const osInfo = await si.osInfo();

    const data = {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      arch: osInfo.arch,
    };

    cache.set('os', data);
    return data;
  } catch (error) {
    console.error('Error getting OS info:', error);
    return {
      platform: 'unknown',
      distro: 'unknown',
      release: 'unknown',
      kernel: 'unknown',
      arch: 'unknown',
    };
  }
}

export async function getHostStats(): Promise<HostStats> {
  try {
    const [cpu, memory, disk, network, uptime, os] = await Promise.all([
      getHostCPU(),
      getHostMemory(),
      getHostDisk(),
      getHostNetwork(),
      getHostUptime(),
      getHostInfo(),
    ]);

    return {
      cpu,
      memory,
      disk,
      network,
      uptime,
      os,
    };
  } catch (error) {
    console.error('Error getting host stats:', error);
    throw error;
  }
}

// Clear cache (useful for testing or manual refresh)
export function clearStatsCache(): void {
  cache.clear();
  lastNetworkStats = null;
}
