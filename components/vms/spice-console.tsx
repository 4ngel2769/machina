'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Maximize, 
  Minimize, 
  Download, 
  Power, 
  MonitorOff,
  RefreshCw,
  Settings,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SpiceConsoleProps {
  vmName: string;
  host: string;
  port: number;
  password?: string;
  onDisconnect?: () => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
type SpiceConnection = {
  stop: () => void;
  sendCtrlAltDel: () => void;
};

export function SpiceConsole({ vmName, host, port, password, onDisconnect, className }: SpiceConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spiceRef = useRef<SpiceConnection | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 3;
  const [error, setError] = useState<string>('');

  const handleDisconnect = () => {
    if (spiceRef.current) {
      try {
        spiceRef.current.stop();
      } catch (e) {
        console.error('[SPICE] Error stopping:', e);
      }
      spiceRef.current = null;
    }
    setConnectionState('disconnected');
    onDisconnect?.();
  };

  // Connect on mount
  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;
    const connectSpice = async () => {
      try {
        // Dynamically import SPICE client (browser-only)
        const { SpiceMainConn } = await import('@spice-project/spice-html5');
        
        if (!mounted) return;

        console.log('[SPICE] Connecting to:', `${host}:${port}`);

        // Create SPICE connection
        const sc = new SpiceMainConn({
          uri: `ws://${host}:${port}`,
          screen_id: 'spice-screen',
          password: password || '',
          onerror: (err: Error) => {
            if (!mounted) return;
            console.error('[SPICE] Error:', err);
            setError(err.message);
            setConnectionState('failed');
            toast.error(`SPICE error: ${err.message}`);
          },
          onsuccess: () => {
            if (!mounted) return;
            console.log('[SPICE] Connected successfully');
            setConnectionState('connected');
            setReconnectAttempts(0);
            setError('');
            toast.success(`Connected to ${vmName} via SPICE`);
          },
          ondisconnect: () => {
            if (!mounted) return;
            console.log('[SPICE] Disconnected');
            setConnectionState('disconnected');
            
            // Auto-reconnect on unexpected disconnect
            if (reconnectAttempts < maxReconnectAttempts) {
              console.log(`[SPICE] Will reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
              setTimeout(() => {
                if (mounted) {
                  setReconnectAttempts(prev => prev + 1);
                }
              }, 2000);
            }
          },
        });

        spiceRef.current = sc;
        sc.start();
      } catch (error) {
        if (!mounted) return;
        console.error('[SPICE] Connection error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Failed to connect';
        setError(errorMsg);
        setTimeout(() => {
          if (mounted) {
            setConnectionState('failed');
            toast.error(`Failed to connect via SPICE: ${errorMsg}`);
          }
        }, 0);
      }
    };

    connectSpice();

    return () => {
      mounted = false;
      if (spiceRef.current) {
        try {
          spiceRef.current.stop();
        } catch {
          // Ignore cleanup errors
        }
        spiceRef.current = null;
      }
    };
  }, [host, port, password, vmName, reconnectAttempts, maxReconnectAttempts]);

  const sendCtrlAltDel = () => {
    if (spiceRef.current && connectionState === 'connected') {
      try {
        spiceRef.current.sendCtrlAltDel();
        toast.success('Sent Ctrl+Alt+Del');
      } catch {
        toast.error('Failed to send Ctrl+Alt+Del');
      }
    }
  };

  const takeScreenshot = () => {
    try {
      const canvas = containerRef.current?.querySelector('canvas');
      if (!canvas) {
        toast.error('No canvas found');
        return;
      }

      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${vmName}-screenshot-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success('Screenshot saved');
        }
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
      toast.error('Failed to take screenshot');
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes to update state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const reconnect = () => {
    setReconnectAttempts(0);
    setConnectionState('connecting');
    setError('');
  };

  const openInNewWindow = () => {
    // Create a standalone SPICE viewer window
    const width = 1024;
    const height = 768;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    const windowFeatures = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
    const newWindow = window.open(window.location.href + '?popup=true', `SPICE_${vmName}`, windowFeatures);
    
    if (newWindow) {
      toast.success('Opened in new window');
    } else {
      toast.error('Failed to open new window. Please allow popups.');
    }
  };

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'connecting':
        return <Badge variant="outline" className="animate-pulse">Connecting...</Badge>;
      case 'connected':
        return <Badge className="bg-green-500">Connected (SPICE)</Badge>;
      case 'disconnected':
        return <Badge variant="secondary">Disconnected</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Controls Bar - Keep visible in fullscreen */}
      <div className={cn("flex items-center justify-between gap-4 p-3 bg-card border-b", isFullscreen && "absolute top-0 left-0 right-0 z-50")}>
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{vmName}</h3>
          {getConnectionBadge()}
        </div>

        <div className="flex items-center gap-2">
          {/* Open in New Window */}
          <Button
            variant="outline"
            size="sm"
            onClick={openInNewWindow}
            title="Open in New Window"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>

          {/* Ctrl+Alt+Del */}
          <Button
            variant="outline"
            size="sm"
            onClick={sendCtrlAltDel}
            disabled={connectionState !== 'connected'}
            title="Send Ctrl+Alt+Del"
          >
            <Power className="h-4 w-4" />
          </Button>

          {/* Screenshot */}
          <Button
            variant="outline"
            size="sm"
            onClick={takeScreenshot}
            disabled={connectionState !== 'connected'}
            title="Take Screenshot"
          >
            <Download className="h-4 w-4" />
          </Button>

          {/* Fullscreen */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen (F11)"
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>

          {/* Settings */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

          {/* Disconnect */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            title="Disconnect"
          >
            <MonitorOff className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-muted border-b">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <strong>Host:</strong> {host}:{port}
            </div>
            <div>
              <strong>Protocol:</strong> SPICE
            </div>
            <div>
              <strong>State:</strong> {connectionState}
            </div>
            <div>
              <strong>Reconnect Attempts:</strong> {reconnectAttempts}/{maxReconnectAttempts}
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* SPICE Canvas Container */}
      <div className="flex-1 relative bg-black">
        <div 
          ref={containerRef}
          id="spice-screen" 
          className="w-full h-full flex items-center justify-center"
        />

        {/* Connection States Overlay */}
        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Connecting to {vmName} via SPICE...</p>
            </div>
          </div>
        )}

        {connectionState === 'disconnected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white space-y-4">
              <MonitorOff className="h-12 w-12 mx-auto mb-2" />
              <p>Disconnected from {vmName}</p>
              {reconnectAttempts < maxReconnectAttempts && (
                <Button onClick={reconnect} variant="secondary">
                  Reconnect
                </Button>
              )}
            </div>
          </div>
        )}

        {connectionState === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white space-y-4">
              <MonitorOff className="h-12 w-12 mx-auto mb-2 text-red-500" />
              <p>Connection Failed</p>
              <p className="text-sm text-gray-400">
                {error || 'Check if VM is running and SPICE is enabled'}
              </p>
              <Button onClick={reconnect} variant="secondary">
                Try Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
