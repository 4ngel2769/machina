import { WebSocket, WebSocketServer as WSServer } from 'ws';

export interface WebSocketServer {
  port: number;
  wss: WSServer | null;
}

// WebSocket server for real-time updates
export function createWebSocketServer(port = 3001): WebSocketServer {
  // This will be implemented in later phases
  // Will handle real-time stats, logs, and terminal connections
  return {
    port,
    wss: null,
  };
}

export function broadcastToClients(wss: WSServer, message: unknown) {
  if (!wss) return;
  
  const data = JSON.stringify(message);
  wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

export function handleTerminalConnection(ws: WebSocket, containerId: string) {
  void ws;
  void containerId;
  // TODO: Implement terminal connection to container
  // Would use docker exec with interactive TTY
}

export function handleStatsStream(
  ws: WebSocket,
  resourceId: string,
  type: 'container' | 'vm'
) {
  void ws;
  void resourceId;
  void type;
  // TODO: Implement real-time stats streaming
}
