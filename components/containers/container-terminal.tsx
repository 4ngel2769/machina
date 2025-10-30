'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

// Types for xterm (loaded dynamically)
/* eslint-disable @typescript-eslint/no-explicit-any */
type XTermTerminal = any;
type FitAddon = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ContainerTerminalProps {
  containerId: string;
}

export function ContainerTerminal({ containerId }: ContainerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!containerId) return;

    let terminal: XTermTerminal | null = null;
    let fitAddon: FitAddon | null = null;
    let ws: WebSocket | null = null;

    const initTerminal = async () => {
      try {
        // Dynamic imports to avoid SSR
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        const { WebLinksAddon } = await import('xterm-addon-web-links');

        // Import xterm CSS
        await import('xterm/css/xterm.css');

        terminal = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: '"Fira Code", "JetBrains Mono", "Consolas", monospace',
          theme: {
            background: '#0a0a0a',
            foreground: '#e5e5e5',
            cursor: '#00ff00',
          },
          rows: 30,
          cols: 120,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        if (terminalRef.current) {
          terminal.open(terminalRef.current);
          fitAddon.fit();
        }

        termRef.current = terminal;

        // Show connection message
        setConnectionStatus('connecting');
        terminal.writeln('\x1b[1;32m╔═══════════════════════════════════════════════╗\x1b[0m');
        terminal.writeln('\x1b[1;32m║      Machina - Container Terminal            ║\x1b[0m');
        terminal.writeln('\x1b[1;32m╚═══════════════════════════════════════════════╝\x1b[0m');
        terminal.writeln('');
        terminal.writeln('\x1b[36mConnecting to container shell via WebSocket...\x1b[0m');
        terminal.writeln('');

        // Connect to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/containers/${containerId}/terminal/ws`;
        
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('connected');
          terminal?.writeln('\x1b[1;32m✓ Connected to interactive shell\x1b[0m');
          terminal?.writeln('');
        };

        ws.onmessage = (event) => {
          if (terminal && event.data) {
            terminal.write(event.data);
          }
        };

        ws.onerror = () => {
          setConnectionStatus('disconnected');
          terminal?.writeln('\x1b[1;31m✗ Connection error\x1b[0m');
          toast.error('WebSocket connection error');
        };

        ws.onclose = () => {
          setConnectionStatus('disconnected');
          terminal?.writeln('\x1b[1;33m\r\n✗ Connection closed\x1b[0m');
        };

        terminal.onData((data: string) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        // Handle window resize
        const handleResize = () => {
          fitAddon?.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          if (ws) {
            ws.close();
          }
          if (terminal) {
            terminal.dispose();
          }
        };
      } catch (error) {
        console.error('Error initializing terminal:', error);
        toast.error('Failed to initialize terminal');
        setConnectionStatus('disconnected');
      }
    };

    initTerminal();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [containerId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge
          variant={connectionStatus === 'connected' ? 'default' : 'secondary'}
          className={
            connectionStatus === 'connected'
              ? 'bg-green-600'
              : connectionStatus === 'connecting'
              ? 'bg-yellow-600'
              : 'bg-gray-600'
          }
        >
          {connectionStatus}
        </Badge>
      </div>
      <div
        ref={terminalRef}
        className="rounded-lg overflow-hidden border border-border"
        style={{ height: '600px' }}
      />
      <div className="text-xs text-muted-foreground space-y-1">
        <p>💡 <strong>Tip:</strong> Full interactive shell with command history and tab completion</p>
        <p>✅ <strong>WebSocket:</strong> Real-time bidirectional communication for proper TTY support</p>
      </div>
    </div>
  );
}
