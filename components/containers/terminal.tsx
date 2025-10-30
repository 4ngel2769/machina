'use client';

import { useEffect, useRef, useState } from 'react';
import { Container } from '@/types/container';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import { toast } from 'sonner';

// Dynamic import for xterm to avoid SSR issues
// Note: xterm requires client-side only rendering

interface TerminalProps {
  container: Container | null;
  open: boolean;
  onClose: () => void;
}

export function Terminal({ container, open, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [term, setTerm] = useState<any>(null);

  useEffect(() => {
    if (!open || !container) return;

    let terminal: any;
    let fitAddon: any;

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
        });

        fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.loadAddon(new WebLinksAddon());

        if (terminalRef.current) {
          terminal.open(terminalRef.current);
          fitAddon.fit();
        }

        setTerm(terminal);

        // Show connection message
        setConnectionStatus('connecting');
        terminal.writeln('\x1b[1;32m╔═══════════════════════════════════════════════╗\x1b[0m');
        terminal.writeln('\x1b[1;32m║      Machina - Container Terminal            ║\x1b[0m');
        terminal.writeln('\x1b[1;32m╚═══════════════════════════════════════════════╝\x1b[0m');
        terminal.writeln('');
        terminal.writeln(`\x1b[1mContainer:\x1b[0m ${container.name}`);
        terminal.writeln(`\x1b[1mImage:\x1b[0m ${container.image}`);
        terminal.writeln('');
        terminal.writeln('\x1b[33mNote: Full interactive terminal requires WebSocket implementation.\x1b[0m');
        terminal.writeln('\x1b[33mFor now, use Docker CLI or implement custom WebSocket server.\x1b[0m');
        terminal.writeln('');
        terminal.writeln('Type commands and press Enter to execute:');
        terminal.writeln('');

        setConnectionStatus('connected');

        // Simple command execution (non-interactive)
        let currentLine = '';
        terminal.onData((data: string) => {
          if (data === '\r') {
            // Enter pressed
            terminal.writeln('');
            if (currentLine.trim()) {
              executeCommand(terminal, container.id, currentLine.trim());
            }
            currentLine = '';
            terminal.write('$ ');
          } else if (data === '\x7f') {
            // Backspace
            if (currentLine.length > 0) {
              currentLine = currentLine.slice(0, -1);
              terminal.write('\b \b');
            }
          } else if (data === '\x03') {
            // Ctrl+C
            terminal.writeln('^C');
            currentLine = '';
            terminal.write('$ ');
          } else {
            currentLine += data;
            terminal.write(data);
          }
        });

        terminal.write('$ ');

        // Handle window resize
        const handleResize = () => {
          fitAddon.fit();
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
          terminal.dispose();
        };
      } catch (error) {
        console.error('Error initializing terminal:', error);
        toast.error('Failed to initialize terminal');
        setConnectionStatus('disconnected');
      }
    };

    initTerminal();

    return () => {
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [open, container]);

  const executeCommand = async (terminal: any, containerId: string, command: string) => {
    try {
      terminal.writeln(`\x1b[90mExecuting: ${command}\x1b[0m`);
      const response = await fetch(`/api/containers/${containerId}/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        const error = await response.json();
        terminal.writeln(`\x1b[31mError: ${error.error}\x1b[0m`);
        return;
      }

      const data = await response.json();
      if (data.data?.output) {
        terminal.writeln(data.data.output);
      }
    } catch (error) {
      terminal.writeln(`\x1b[31mError executing command: ${error}\x1b[0m`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
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
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="p-6 pt-4">
          <div
            ref={terminalRef}
            className="rounded-lg overflow-hidden border border-border"
            style={{ height: '500px' }}
          />
          <div className="mt-4 text-xs text-muted-foreground space-y-1">
            <p>💡 <strong>Tip:</strong> Ctrl+C to interrupt, Ctrl+D to exit</p>
            <p>⚠️ <strong>Note:</strong> Full interactive shell requires WebSocket implementation (Phase 3)</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
