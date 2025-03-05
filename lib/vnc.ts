import { execSync, spawn, ChildProcess } from 'child_process';

interface VNCProxy {
  vmName: string;
  vncPort: number;
  wsPort: number;
  process: ChildProcess;
  createdAt: Date;
}

// Store active websockify proxies
const activeProxies = new Map<string, VNCProxy>();

/**
 * Get VNC port for a VM from its XML configuration
 */
export function getVNCPort(vmName: string): number | null {
  try {
    const xml = execSync(`virsh dumpxml ${vmName}`, {
      encoding: 'utf-8',
    });

    // Parse VNC port from XML
    // Look for: <graphics type='vnc' port='5900' ...>
    const portMatch = xml.match(/<graphics[^>]+type=['"]vnc['"][^>]+port=['"](\d+)['"]/) ||
                     xml.match(/<graphics[^>]+port=['"](\d+)['"][^>]+type=['"]vnc['"]/);
    
    if (portMatch && portMatch[1]) {
      const port = parseInt(portMatch[1]);
      // Port -1 means auto-assigned, we need to get the actual port
      if (port === -1 || port === 0) {
        // Try to get from domstats
        return getVNCPortFromRunningVM(vmName);
      }
      return port;
    }

    // Check if VNC is using autoport
    const autoport = xml.includes("autoport='yes'");
    if (autoport) {
      return getVNCPortFromRunningVM(vmName);
    }

    return null;
  } catch (error) {
    console.error(`Failed to get VNC port for ${vmName}:`, error);
    return null;
  }
}

/**
 * Get VNC port from a running VM
 */
function getVNCPortFromRunningVM(_vmName: string): number | null {
  try {
    // For running VMs with autoport, check the actual assigned port
    // This is more complex and may require parsing additional virsh output
    // For now, return default VNC port
    return 5900;
  } catch {
    return null;
  }
}

/**
 * Find an available WebSocket port for websockify
 */
function findAvailablePort(startPort: number = 6080): number {
  // Simple implementation - in production, should check if port is actually free
  const usedPorts = Array.from(activeProxies.values()).map(p => p.wsPort);
  let port = startPort;
  while (usedPorts.includes(port)) {
    port++;
  }
  return port;
}

/**
 * Start websockify proxy for a VM
 * Returns the WebSocket URL and proxy ID
 */
export async function startWebsockifyProxy(
  vmName: string,
  vncPort: number
): Promise<{ wsUrl: string; wsPort: number; proxyId: string }> {
  // Check if proxy already exists for this VM
  const existing = activeProxies.get(vmName);
  if (existing) {
    return {
      wsUrl: `ws://localhost:${existing.wsPort}`,
      wsPort: existing.wsPort,
      proxyId: vmName,
    };
  }

  const wsPort = findAvailablePort();
  const vncHost = 'localhost';

  return new Promise((resolve, reject) => {
    try {
      // Start websockify process
      // Note: websockify must be installed (pip install websockify or npm install -g websockify)
      const websockify = spawn('websockify', [
        '--web', '/usr/share/novnc',
        `${wsPort}`,
        `${vncHost}:${vncPort}`,
      ]);

      // Store the proxy
      const proxy: VNCProxy = {
        vmName,
        vncPort,
        wsPort,
        process: websockify,
        createdAt: new Date(),
      };

      activeProxies.set(vmName, proxy);

      // Handle process events
      websockify.stdout?.on('data', (data) => {
        console.log(`[websockify ${vmName}] ${data}`);
      });

      websockify.stderr?.on('data', (data) => {
        console.error(`[websockify ${vmName}] ERROR: ${data}`);
      });

      websockify.on('error', (error) => {
        console.error(`[websockify ${vmName}] Failed to start:`, error);
        activeProxies.delete(vmName);
        reject(error);
      });

      websockify.on('exit', (code) => {
        console.log(`[websockify ${vmName}] Process exited with code ${code}`);
        activeProxies.delete(vmName);
      });

      // Wait a moment for websockify to start
      setTimeout(() => {
        resolve({
          wsUrl: `ws://localhost:${wsPort}`,
          wsPort,
          proxyId: vmName,
        });
      }, 1000);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Stop websockify proxy
 */
export function stopWebsockifyProxy(proxyId: string): boolean {
  const proxy = activeProxies.get(proxyId);
  if (!proxy) {
    return false;
  }

  try {
    proxy.process.kill('SIGTERM');
    activeProxies.delete(proxyId);
    console.log(`[websockify] Stopped proxy for ${proxyId}`);
    return true;
  } catch (error) {
    console.error(`Failed to stop websockify proxy for ${proxyId}:`, error);
    return false;
  }
}

/**
 * Get active proxies
 */
export function getActiveProxies(): VNCProxy[] {
  return Array.from(activeProxies.values());
}

/**
 * Cleanup all proxies (call on server shutdown)
 */
export function cleanupAllProxies(): void {
  console.log(`[websockify] Cleaning up ${activeProxies.size} proxies`);
  for (const [vmName, proxy] of activeProxies.entries()) {
    try {
      proxy.process.kill('SIGTERM');
    } catch (error) {
      console.error(`Failed to stop proxy for ${vmName}:`, error);
    }
  }
  activeProxies.clear();
}

/**
 * Cleanup inactive proxies (older than timeout)
 */
export function cleanupInactiveProxies(timeoutMinutes: number = 30): void {
  const now = new Date();
  for (const [vmName, proxy] of activeProxies.entries()) {
    const age = (now.getTime() - proxy.createdAt.getTime()) / 1000 / 60;
    if (age > timeoutMinutes) {
      console.log(`[websockify] Cleaning up inactive proxy for ${vmName} (age: ${age.toFixed(1)}min)`);
      stopWebsockifyProxy(vmName);
    }
  }
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('SIGINT', cleanupAllProxies);
  process.on('SIGTERM', cleanupAllProxies);
  process.on('exit', cleanupAllProxies);
}
