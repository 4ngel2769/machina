'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import RFB from '@novnc/novnc/core/rfb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Maximize, 
  Minimize, 
  Download, 
  Power, 
  MonitorOff,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';

interface VNCConsoleProps {
  vmName: string;
  wsUrl: string;
  onDisconnect?: () => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
type ScaleMode = 'remote' | 'local' | 'none';

export function VNCConsole({ vmName, wsUrl, onDisconnect, className }: VNCConsoleProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('remote');
  const [showSettings, setShowSettings] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 3;

  const handleDisconnect = useCallback(() => {
    if (rfbRef.current) {
      rfbRef.current.disconnect();
      rfbRef.current = null;
    }
    setConnectionState('disconnected');
    onDisconnect?.();
  }, [onDisconnect]);

  // Connect on mount and reconnect
  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      console.log('[VNC] Connecting to:', wsUrl);
      
      // Create RFB connection
      const rfb = new RFB(canvasRef.current, wsUrl, {
        credentials: { password: '' },
      });

      // Set scaling mode
      rfb.scaleViewport = scaleMode === 'remote';
      rfb.resizeSession = scaleMode === 'local';

      // Connection events
      rfb.addEventListener('connect', () => {
        console.log('[VNC] Connected');
        setConnectionState('connected');
        setReconnectAttempts(0);
        toast.success(`Connected to ${vmName}`);
      });

      rfb.addEventListener('disconnect', (e: unknown) => {
        const eventDetail = e as { detail?: { clean?: boolean } };
        console.log('[VNC] Disconnected:', eventDetail.detail);
        setConnectionState('disconnected');
        
        // Auto-reconnect on unexpected disconnect
        if (!eventDetail.detail?.clean && reconnectAttempts < maxReconnectAttempts) {
          console.log(`[VNC] Will reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
          setReconnectAttempts(prev => prev + 1);
        }
      });

      rfb.addEventListener('securityfailure', (e: unknown) => {
        const eventDetail = e as { detail?: unknown };
        console.error('[VNC] Security failure:', eventDetail.detail);
        setConnectionState('failed');
        toast.error('VNC authentication failed');
      });

      rfb.addEventListener('credentialsrequired', () => {
        console.log('[VNC] Credentials required');
        toast.error('VNC password required (not yet implemented)');
      });

      rfbRef.current = rfb;
    } catch (error) {
      console.error('[VNC] Connection error:', error);
      setConnectionState('failed');
      toast.error('Failed to connect to VNC');
    }

    return () => {
      if (rfbRef.current) {
        rfbRef.current.disconnect();
        rfbRef.current = null;
      }
    };
  }, [wsUrl, vmName, scaleMode, reconnectAttempts, maxReconnectAttempts]);

  // Update scaling when mode changes
  useEffect(() => {
    if (rfbRef.current && connectionState === 'connected') {
      rfbRef.current.scaleViewport = scaleMode === 'remote';
      rfbRef.current.resizeSession = scaleMode === 'local';
    }
  }, [scaleMode, connectionState]);

  const sendCtrlAltDel = () => {
    if (rfbRef.current && connectionState === 'connected') {
      rfbRef.current.sendCtrlAltDel();
      toast.success('Sent Ctrl+Alt+Del');
    }
  };

  const takeScreenshot = () => {
    if (!canvasRef.current) return;

    try {
      const canvas = canvasRef.current.querySelector('canvas');
      if (!canvas) return;

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
    if (!document.fullscreenElement) {
      canvasRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const reconnect = () => {
    setReconnectAttempts(0);
    setConnectionState('connecting');
  };

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Keyboard shortcut for fullscreen (F11)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  const getConnectionBadge = () => {
    switch (connectionState) {
      case 'connecting':
        return <Badge variant="outline" className="animate-pulse">Connecting...</Badge>;
      case 'connected':
        return <Badge className="bg-green-500">Connected</Badge>;
      case 'disconnected':
        return <Badge variant="secondary">Disconnected</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Controls Bar */}
      <div className="flex items-center justify-between gap-4 p-3 bg-card border-b">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{vmName}</h3>
          {getConnectionBadge()}
        </div>

        <div className="flex items-center gap-2">
          {/* Scale Mode */}
          <Select value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleMode)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>

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
              <strong>WebSocket URL:</strong> {wsUrl}
            </div>
            <div>
              <strong>Scale Mode:</strong> {scaleMode}
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

      {/* VNC Canvas */}
      <div className="flex-1 relative bg-black">
        <div 
          ref={canvasRef} 
          className="w-full h-full flex items-center justify-center"
        />

        {/* Connection States Overlay */}
        {connectionState === 'connecting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p>Connecting to {vmName}...</p>
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
              <p className="text-sm text-gray-400">Check if VM is running and VNC is enabled</p>
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
