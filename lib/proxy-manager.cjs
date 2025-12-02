/**
 * WebSocket Proxy Manager for VNC/SPICE connections
 * Automatically manages websockify processes for VM consoles
 */

require('dotenv').config();

const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const net = require('net');

class ProxyManager {
  constructor() {
    this.proxies = new Map(); // vmName -> { process, wsPort, vncPort }
    this.baseWsPort = parseInt(process.env.WEBSOCKET_BASE_PORT || '6080', 10);
    this.portOffset = 0;
    this.websocketListenHost = process.env.WEBSOCKET_LISTEN_HOST || '127.0.0.1';
    this.publicHost = process.env.PUBLIC_HOST || 'localhost';
    this.sessionTtlMs = parseInt(process.env.VNC_SESSION_TTL_SECONDS || '3600', 10) * 1000;
    this.sessions = new Map(); // token -> { vmName, wsPort, expiresAt }
  }

  /**
   * Check if a port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port, this.websocketListenHost);
    });
  }

  /**
   * Find an available WebSocket port
   */
  async findAvailableWsPort() {
    for (let i = 0; i < 100; i++) {
      const port = this.baseWsPort + i;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error('No available WebSocket ports');
  }

  /**
   * Start websockify proxy for a VM
   */
  async startProxy(vmName, vncPort, listen = null) {
    // Use environment variable or passed listen address
    const vncListen = listen || process.env.VM_DISPLAY_LISTEN || '127.0.0.1';
    
    // Check if proxy already exists
    if (this.proxies.has(vmName)) {
      const existing = this.proxies.get(vmName);
      console.log(`[Proxy] Proxy already running for ${vmName} on port ${existing.wsPort}`);
      return existing.wsPort;
    }

    try {
      // Find available WebSocket port
      const wsPort = await this.findAvailableWsPort();
      
      console.log(`[Proxy] Starting websockify for ${vmName}: ws://${this.publicHost}:${wsPort} -> ${vncListen}:${vncPort}`);

      // Start websockify process
      // Format: websockify [options] [listen_port] [target_host:target_port]
      const args = [
        wsPort.toString(),             // Port to listen on
        `${vncListen}:${vncPort}`,     // Target VNC server
        '--verbose'
      ];

      // If we need to listen on specific interface (not 0.0.0.0), add --listen
      if (this.websocketListenHost !== '0.0.0.0') {
        args.unshift('--listen', this.websocketListenHost);
      }

      console.log(`[Proxy] Command: websockify ${args.join(' ')}`);

      const process = spawn('websockify', args, {
        shell: true,  // Use shell on Windows to find the command
        windowsHide: true
      });

      // Handle process output
      process.stdout.on('data', (data) => {
        console.log(`[Proxy:${vmName}] ${data.toString().trim()}`);
      });

      process.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        // Show all stderr output for debugging
        console.log(`[Proxy:${vmName}] ${msg}`);
      });

      process.on('error', (error) => {
        console.error(`[Proxy:${vmName}] Failed to start:`, error.message);
        this.proxies.delete(vmName);
      });

      process.on('exit', (code, signal) => {
        console.log(`[Proxy:${vmName}] Exited with code ${code}, signal ${signal}`);
        this.proxies.delete(vmName);
      });

      // Wait a bit for the process to start
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the port is now in use
      const portInUse = !(await this.isPortAvailable(wsPort));
      if (!portInUse) {
        process.kill();
        throw new Error('websockify failed to bind to port');
      }

      // Store proxy info
      this.proxies.set(vmName, {
        process,
        wsPort,
        vncPort,
        listen: vncListen,
        publicHost: this.publicHost,
        wsHost: this.websocketListenHost,
        startedAt: new Date()
      });

      console.log(`[Proxy] ✓ Proxy started for ${vmName} on ws://${this.publicHost}:${wsPort}`);
      return wsPort;

    } catch (error) {
      console.error(`[Proxy] Failed to start proxy for ${vmName}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop websockify proxy for a VM
   */
  stopProxy(vmName) {
    const proxy = this.proxies.get(vmName);
    if (!proxy) {
      console.log(`[Proxy] No proxy running for ${vmName}`);
      return false;
    }

    console.log(`[Proxy] Stopping proxy for ${vmName} (port ${proxy.wsPort})`);
    
    try {
      proxy.process.kill('SIGTERM');
      this.proxies.delete(vmName);
      this.invalidateSessionsForVm(vmName);
      return true;
    } catch (error) {
      console.error(`[Proxy] Error stopping proxy for ${vmName}:`, error.message);
      this.proxies.delete(vmName);
      this.invalidateSessionsForVm(vmName);
      return false;
    }
  }

  /**
   * Get proxy info for a VM
   */
  getProxy(vmName) {
    return this.proxies.get(vmName) || null;
  }

  /**
   * Stop all proxies
   */
  stopAll() {
    console.log(`[Proxy] Stopping all ${this.proxies.size} proxies...`);
    for (const [vmName] of this.proxies) {
      this.stopProxy(vmName);
    }
  }

  /**
   * List all active proxies
   */
  listProxies() {
    const list = [];
    for (const [vmName, proxy] of this.proxies) {
      list.push({
        vmName,
        wsPort: proxy.wsPort,
        vncPort: proxy.vncPort,
        listen: proxy.listen,
        startedAt: proxy.startedAt,
        uptime: Date.now() - proxy.startedAt.getTime()
      });
    }
    return list;
  }

  /**
   * Check if websockify is installed
   */
  async checkWebsockify() {
    return new Promise((resolve) => {
      const process = spawn('which', ['websockify']);
      process.on('exit', (code) => {
        resolve(code === 0);
      });
      process.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Create (or refresh) a secure session token for a VM proxy
   */
  createSession(vmName) {
    const proxy = this.proxies.get(vmName);
    if (!proxy) {
      throw new Error(`No proxy running for VM ${vmName}`);
    }

    this.cleanupExpiredSessions();

    const token = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + this.sessionTtlMs);

    const session = {
      token,
      vmName,
      wsPort: proxy.wsPort,
      wsHost: proxy.wsHost || this.websocketListenHost,
      createdAt: new Date(now),
      expiresAt,
    };

    this.sessions.set(token, session);
    return session;
  }

  /**
   * Get session details if still valid
   */
  getSession(token) {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  /**
   * Extend a session when actively used
   */
  touchSession(token) {
    const session = this.sessions.get(token);
    if (!session) {
      return null;
    }

    session.expiresAt = new Date(Date.now() + this.sessionTtlMs);
    this.sessions.set(token, session);
    return session;
  }

  /**
   * Remove session by token
   */
  invalidateSession(token) {
    this.sessions.delete(token);
  }

  /**
   * Remove all sessions tied to a VM
   */
  invalidateSessionsForVm(vmName) {
    for (const [token, session] of this.sessions.entries()) {
      if (session.vmName === vmName) {
        this.sessions.delete(token);
      }
    }
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt.getTime() < now) {
        this.sessions.delete(token);
      }
    }
  }
}

// Export singleton instance
const proxyManager = new ProxyManager();

module.exports = proxyManager;
