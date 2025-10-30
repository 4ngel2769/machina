/**
 * Custom Next.js server with WebSocket support for container terminals
 * @eslint-disable
 */
/* eslint-disable @typescript-eslint/no-var-requires */
require('dotenv').config();

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { WebSocketServer } = require('ws');
const Docker = require('dockerode');

// Import proxy manager
const proxyManager = require('./lib/proxy-manager.cjs');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.SERVER_HOST || '0.0.0.0';
const port = parseInt(process.env.SERVER_PORT || process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize default admin user (async import for ES modules)
async function initializeAuth() {
  try {
    const { initializeDefaultAdmin } = await import('./lib/auth/user-storage.ts');
    await initializeDefaultAdmin();
  } catch (error) {
    console.error('Error initializing authentication:', error);
  }
}

app.prepare().then(async () => {
  // Initialize authentication
  await initializeAuth();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '', true);

    // Check if this is a terminal WebSocket request
    if (pathname?.startsWith('/api/containers/') && pathname.endsWith('/terminal/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle WebSocket connections
  wss.on('connection', async (ws, request) => {
    const { pathname } = parse(request.url || '', true);
    const match = pathname?.match(/\/api\/containers\/([^/]+)\/terminal\/ws/);
    
    if (!match) {
      ws.close(1008, 'Invalid endpoint');
      return;
    }

    const containerId = match[1];
    console.log(`[Terminal] New connection for container: ${containerId}`);

    let docker;
    let container;
    let exec;
    let stream;

    try {
      // Initialize Docker client
      docker = new Docker();
      container = docker.getContainer(containerId);

      // Check if container is running
      const info = await container.inspect();
      if (info.State.Status !== 'running') {
        ws.send(JSON.stringify({
          type: 'error',
          data: 'Container is not running'
        }));
        ws.close(1008, 'Container not running');
        return;
      }

      // Create exec instance for interactive shell
      exec = await container.exec({
        Cmd: ['/bin/sh'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: ['TERM=xterm-256color'],
      });

      // Start the exec
      stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Send initial connection success message
      ws.send(JSON.stringify({
        type: 'connected',
        data: {
          containerId,
          containerName: info.Name.replace(/^\//, ''),
          image: info.Config.Image,
        }
      }));

      // Forward data from container to WebSocket
      stream.on('data', (chunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'output',
            data: chunk.toString('utf-8')
          }));
        }
      });

      // Handle stream end
      stream.on('end', () => {
        console.log(`[Terminal] Stream ended for container: ${containerId}`);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'disconnected',
            data: 'Shell session ended'
          }));
          ws.close(1000, 'Stream ended');
        }
      });

      // Handle stream errors
      stream.on('error', (error) => {
        console.error(`[Terminal] Stream error for container ${containerId}:`, error);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            data: error.message
          }));
        }
      });

      // Forward data from WebSocket to container
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'input') {
            // Write input to container
            stream.write(data.data);
          } else if (data.type === 'resize') {
            // Handle terminal resize
            exec.resize({
              h: data.rows || 30,
              w: data.cols || 100,
            }).catch(err => {
              console.error('Resize error:', err);
            });
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      // Handle WebSocket close
      ws.on('close', () => {
        console.log(`[Terminal] WebSocket closed for container: ${containerId}`);
        if (stream) {
          stream.end();
        }
      });

      // Handle WebSocket errors
      ws.on('error', (error) => {
        console.error(`[Terminal] WebSocket error for container ${containerId}:`, error);
        if (stream) {
          stream.end();
        }
      });

    } catch (error) {
      console.error(`[Terminal] Error setting up terminal for container ${containerId}:`, error);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'error',
          data: error.message || 'Failed to start terminal session'
        }));
        ws.close(1011, 'Internal error');
      }
    }
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket terminal support enabled`);
    console.log(`> Automatic VNC proxy management enabled`);
  });

  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, cleaning up...');
    proxyManager.stopAll();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, cleaning up...');
    proxyManager.stopAll();
    process.exit(0);
  });
});
