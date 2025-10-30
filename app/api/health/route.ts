import { NextResponse } from 'next/server';
import Docker from 'dockerode';
import { execSync } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';

const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    docker: { status: string; message?: string };
    libvirt: { status: string; message?: string };
    disk: { status: string; available: string; total: string; percentage: number };
    memory: { status: string; available: string; total: string; percentage: number };
  };
  timestamp: string;
}

export async function GET() {
  const checks: HealthCheck = {
    status: 'healthy',
    checks: {
      docker: { status: 'unknown' },
      libvirt: { status: 'unknown' },
      disk: { status: 'unknown', available: '0', total: '0', percentage: 0 },
      memory: { status: 'unknown', available: '0', total: '0', percentage: 0 },
    },
    timestamp: new Date().toISOString(),
  };

  let healthyCount = 0;
  const totalChecks = 4;

  // Check Docker daemon
  try {
    await docker.ping();
    checks.checks.docker = { status: 'healthy', message: 'Docker daemon is running' };
    healthyCount++;
  } catch (error) {
    checks.checks.docker = { 
      status: 'unhealthy', 
      message: error instanceof Error ? error.message : 'Docker daemon is not responding' 
    };
  }

  // Check libvirt daemon
  try {
    if (process.platform === 'win32') {
      // On Windows, skip libvirt check as it's not typically used
      checks.checks.libvirt = { status: 'healthy', message: 'Libvirt not applicable on Windows' };
      healthyCount++;
    } else {
      execSync('virsh --connect qemu:///system version', { timeout: 5000, stdio: 'pipe' });
      checks.checks.libvirt = { status: 'healthy', message: 'Libvirt daemon is running' };
      healthyCount++;
    }
  } catch {
    checks.checks.libvirt = { 
      status: 'unhealthy', 
      message: 'Libvirt daemon is not responding or not installed' 
    };
  }

  // Check disk space
  try {
    const dataPath = path.resolve(process.cwd(), 'data');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }

    if (process.platform === 'win32') {
      // Windows disk space check
      const drive = dataPath.split(':')[0] + ':';
      const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size`, { 
        encoding: 'utf-8',
        timeout: 5000 
      });
      const lines = output.trim().split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        const [freeSpace, totalSpace] = lines[1].trim().split(/\s+/).map(Number);
        const usedPercentage = ((totalSpace - freeSpace) / totalSpace) * 100;
        
        checks.checks.disk = {
          status: usedPercentage > 90 ? 'unhealthy' : usedPercentage > 80 ? 'degraded' : 'healthy',
          available: `${(freeSpace / 1024 / 1024 / 1024).toFixed(2)} GB`,
          total: `${(totalSpace / 1024 / 1024 / 1024).toFixed(2)} GB`,
          percentage: parseFloat(usedPercentage.toFixed(2)),
        };
        
        if (checks.checks.disk.status === 'healthy') healthyCount++;
      }
    } else {
      // Unix disk space check
      const output = execSync(`df -k ${dataPath}`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.trim().split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        const total = parseInt(parts[1]) * 1024; // Convert KB to bytes
        const used = parseInt(parts[2]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        const usedPercentage = (used / total) * 100;

        checks.checks.disk = {
          status: usedPercentage > 90 ? 'unhealthy' : usedPercentage > 80 ? 'degraded' : 'healthy',
          available: `${(available / 1024 / 1024 / 1024).toFixed(2)} GB`,
          total: `${(total / 1024 / 1024 / 1024).toFixed(2)} GB`,
          percentage: parseFloat(usedPercentage.toFixed(2)),
        };

        if (checks.checks.disk.status === 'healthy') healthyCount++;
      }
    }
  } catch (error) {
    checks.checks.disk = { 
      status: 'unhealthy', 
      available: '0 GB',
      total: '0 GB',
      percentage: 0,
    };
  }

  // Check memory availability
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedPercentage = (usedMem / totalMem) * 100;

    checks.checks.memory = {
      status: usedPercentage > 95 ? 'unhealthy' : usedPercentage > 85 ? 'degraded' : 'healthy',
      available: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      percentage: parseFloat(usedPercentage.toFixed(2)),
    };

    if (checks.checks.memory.status === 'healthy') healthyCount++;
  } catch (error) {
    checks.checks.memory = { 
      status: 'unhealthy',
      available: '0 GB',
      total: '0 GB',
      percentage: 0,
    };
  }

  // Determine overall status
  if (healthyCount === totalChecks) {
    checks.status = 'healthy';
  } else if (healthyCount >= totalChecks / 2) {
    checks.status = 'degraded';
  } else {
    checks.status = 'unhealthy';
  }

  return NextResponse.json(checks);
}
