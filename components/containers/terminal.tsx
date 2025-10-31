'use client';

import { useEffect, useRef, useState } from 'react';
import { Container } from '@/types/container';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Terminal as TerminalIcon } from 'lucide-react';
import { toast } from 'sonner';

// Types for xterm (loaded dynamically)
/* eslint-disable @typescript-eslint/no-explicit-any */
type XTermTerminal = any;
type FitAddon = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface TerminalProps {
  container: Container | null;
  open: boolean;
  onClose: () => void;
}

export function Terminal({ container, open, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    if (!open || !container) return;

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
            black: '#000000',
            red: '#ff5555',
            green: '#50fa7b',
            yellow: '#f1fa8c',
            blue: '#bd93f9',
            magenta: '#ff79c6',
            cyan: '#8be9fd',
            white: '#bfbfbf',
            brightBlack: '#4d4d4d',
            brightRed: '#ff6e67',
            brightGreen: '#5af78e',
            brightYellow: '#f4f99d',
            brightBlue: '#caa9fa',
            brightMagenta: '#ff92d0',
            brightCyan: '#9aedfe',
            brightWhite: '#e6e6e6',
          },
          rows: 30,
          cols: 100,
          allowTransparency: true,
          scrollback: 1000,
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        if (terminalRef.current) {
          terminal.open(terminalRef.current);
          fitAddon.fit();
          
          // Focus the terminal to enable input
          terminal.focus();
          
          // Add a click handler to focus the terminal
          terminalRef.current.addEventListener('click', () => {
            terminal.focus();
          });
        }

        termRef.current = terminal;

        // Show connection message
        setConnectionStatus('connecting');
        terminal.writeln('\x1b[1;32m╔═══════════════════════════════════════════════╗\x1b[0m');
        terminal.writeln('\x1b[1;32m║      Machina - Container Terminal            ║\x1b[0m');
        terminal.writeln('\x1b[1;32m╚═══════════════════════════════════════════════╝\x1b[0m');
        terminal.writeln('');
        terminal.writeln(`\x1b[1mContainer:\x1b[0m ${container.name}`);
        terminal.writeln(`\x1b[1mImage:\x1b[0m ${container.image}`);
        terminal.writeln('');
        terminal.writeln('\x1b[36mConnecting to container shell via WebSocket...\x1b[0m');
        terminal.writeln('');

        // Connect to WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/containers/${container.id}/terminal/ws`;
        
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('connected');
          terminal.writeln('\x1b[32m✓ Connected to interactive shell\x1b[0m');
          terminal.writeln('\x1b[36mType commands below. Click the terminal to focus it.\x1b[0m');
          terminal.writeln('\x1b[90mTerminal is ready for input...\x1b[0m');
          terminal.writeln('');
          
          // Send initial terminal size
          if (ws) {
            ws.send(JSON.stringify({
              type: 'resize',
              rows: terminal.rows,
              cols: terminal.cols,
            }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
              case 'connected':
                // Initial connection info
                console.log('Terminal connected:', message.data);
                break;
              case 'output':
                if (typeof message.data === 'string') {
                  terminal.write(message.data);
                } else {
                  console.warn('Received non-string output:', message.data);
                }
                break;
              case 'error':
                terminal.writeln(`\r\n\x1b[31mError: ${message.data}\x1b[0m\r\n`);
                break;
              case 'disconnected':
                terminal.writeln(`\r\n\x1b[33m${message.data}\x1b[0m\r\n`);
                setConnectionStatus('disconnected');
                break;
              default:
                console.warn('Unknown message type:', message.type);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            console.error('Raw message data:', event.data);
            // Try to display raw data if it's not JSON
            if (typeof event.data === 'string') {
              terminal.write(event.data);
            }
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          terminal.writeln('\r\n\x1b[31m✗ WebSocket connection error\x1b[0m\r\n');
          setConnectionStatus('disconnected');
          toast.error('Terminal connection error');
        };

        ws.onclose = () => {
          terminal.writeln('\r\n\x1b[33m✗ Connection closed\x1b[0m\r\n');
          setConnectionStatus('disconnected');
        };

        // Send input to container via WebSocket
        terminal.onData((data: string) => {
          console.log('Terminal onData received:', data.length, 'bytes:', JSON.stringify(data));
          if (ws && ws.readyState === WebSocket.OPEN) {
            if (data.length > 0) {
              try {
                const message = JSON.stringify({
                  type: 'input',
                  data: data,
                });
                console.log('Sending JSON to WebSocket:', message);
                ws.send(message);
              } catch (error) {
                console.error('Error creating JSON message:', error);
                // Fallback: send raw data
                console.log('Sending raw data to WebSocket:', JSON.stringify(data));
                ws.send(data);
              }
            } else {
              console.log('Skipping empty data');
            }
          } else {
            console.log('WebSocket not ready, skipping data');
          }
        });

        // Handle terminal resize
        terminal.onResize(({ rows, cols }: { rows: number; cols: number }) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'resize',
              rows,
              cols,
            }));
          }
        });

        // Handle window resize
        const handleResize = () => {
          if (fitAddon) {
            fitAddon.fit();
          }
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
  }, [open, container]);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-5 w-5" />
            <DialogTitle>Terminal - {container?.name}</DialogTitle>
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
        </DialogHeader>
        <div className="p-6 pt-4 overflow-hidden">
          <div
            ref={terminalRef}
            className="rounded-lg overflow-hidden border border-border"
            style={{ height: '500px' }}
          />
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <p>💡 <strong>Tip:</strong> Full interactive shell with command history, tab completion, and text editors</p>
            <p>✅ <strong>WebSocket:</strong> Real-time bidirectional communication for proper TTY support</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
