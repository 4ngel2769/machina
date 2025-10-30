'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  wsUrl?: string;
  onDisconnect?: () => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
type ScaleMode = 'remote' | 'local' | 'none';

export function VNCConsole({ vmName, wsUrl, onDisconnect, className }: VNCConsoleProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<any>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('remote');
  const [showSettings, setShowSettings] = useState(false);
  const [noVNCLoaded, setNoVNCLoaded] = useState(false);

  // Load noVNC dynamically from CDN
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if RFB is already loaded
    if ((window as any).RFB) {
      setNoVNCLoaded(true);
      return;
    }

    // Load noVNC from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/noVNC/1.4.0/core/rfb.min.js';
    script.async = true;
    script.onload = () => {
      console.log('[VNC] noVNC library loaded successfully');
      setNoVNCLoaded(true);
    };
    script.onerror = () => {
      console.error('[VNC] Failed to load noVNC library from CDN');
      toast.error('Failed to load VNC library');
      setConnectionState('failed');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleDisconnect = useCallback(() => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (err) {
        console.error('[VNC] Disconnect error:', err);
      }
      rfbRef.current = null;
    }
    setConnectionState('disconnected');
    onDisconnect?.();
  }, [onDisconnect]);

  // Connect to VNC
  const connectVNC = useCallback(() => {
    if (!canvasRef.current || !noVNCLoaded) {
      console.error('[VNC] Canvas ref or noVNC not ready');
      toast.error('VNC library not loaded yet');
      return;
    }

    if (!wsUrl) {
      toast.error('VNC WebSocket URL not configured');
      setConnectionState('failed');
      return;
    }

    try {
      console.log('[VNC] Connecting to:', wsUrl);
      setConnectionState('connecting');

      // Get RFB from window (loaded dynamically)
      const RFB = (window as any).RFB;
      if (!RFB) {
        throw new Error('noVNC RFB not available');
      }

      // Create RFB connection
      const rfb = new RFB(canvasRef.current, wsUrl, {
        credentials: { password: '' },
      });

      // Set scaling mode
      rfb.scaleViewport = scaleMode === 'remote' || scaleMode === 'local';
      rfb.resizeSession = scaleMode === 'local';

      // Connection events
      rfb.addEventListener('connect', () => {
        console.log('[VNC] Connected successfully');
        setConnectionState('connected');
        toast.success(`Connected to ${vmName}`);
      });

      rfb.addEventListener('disconnect', (e: any) => {
        console.log('[VNC] Disconnected:', e.detail);
        setConnectionState('disconnected');
        
        if (!e.detail?.clean) {
          toast.error('VNC connection lost');
        }
      });

      rfb.addEventListener('securityfailure', (e: any) => {
        console.error('[VNC] Security failure:', e.detail);
        setConnectionState('failed');
        toast.error('VNC authentication failed');
      });

      rfb.addEventListener('credentialsrequired', () => {
        console.log('[VNC] Credentials required');
        toast.error('VNC password required (not yet implemented)');
        setConnectionState('failed');
      });

      rfbRef.current = rfb;
    } catch (error) {
      console.error('[VNC] Connection error:', error);
      setConnectionState('failed');
      toast.error(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [wsUrl, vmName, scaleMode, noVNCLoaded]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch (err) {
          // Ignore disconnect errors on cleanup
        }
        rfbRef.current = null;
      }
    };
  }, []);

  // Update scaling when mode changes
  useEffect(() => {
    if (rfbRef.current && connectionState === 'connected') {
      rfbRef.current.scaleViewport = scaleMode === 'remote' || scaleMode === 'local';
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

    const canvas = canvasRef.current.querySelector('canvas');
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${vmName}-screenshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Screenshot saved');
    });
  };

  const toggleFullscreen = async () => {
    if (!canvasRef.current) return;

    if (!isFullscreen) {
      try {
        await canvasRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        toast.error('Failed to enter fullscreen');
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        toast.error('Failed to exit fullscreen');
      }
    }
  };

  const reconnect = () => {
    handleDisconnect();
    setTimeout(() => {
      connectVNC();
    }, 500);
  };

  const getStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-600';
      case 'connecting':
        return 'bg-yellow-600';
      case 'failed':
        return 'bg-red-600';
      default:
        return 'bg-gray-600';
    }
  };

  const getStatusText = () => {
    switch (connectionState) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'failed':
        return 'Failed';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
        <div className="flex items-center gap-3">
          <Badge className={getStatusColor()}>
            {getStatusText()}
          </Badge>
          <span className="text-sm text-muted-foreground">{vmName}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Scaling Mode */}
          {connectionState === 'connected' && (
            <Select value={scaleMode} onValueChange={(v) => setScaleMode(v as ScaleMode)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Scale: Remote</SelectItem>
                <SelectItem value="local">Scale: Local</SelectItem>
                <SelectItem value="none">Scale: None</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Controls */}
          {connectionState === 'disconnected' && (
            <Button
              size="sm"
              variant="default"
              onClick={connectVNC}
              disabled={!noVNCLoaded || !wsUrl}
            >
              <Power className="h-4 w-4 mr-2" />
              Connect
            </Button>
          )}

          {connectionState === 'connected' && (
            <>
              <Button size="sm" variant="outline" onClick={sendCtrlAltDel} title="Ctrl+Alt+Del">
                <Power className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={takeScreenshot} title="Screenshot">
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={toggleFullscreen} title="Fullscreen">
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </>
          )}

          {(connectionState === 'failed' || connectionState === 'disconnected') && (
            <Button size="sm" variant="outline" onClick={reconnect} title="Reconnect">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}

          {connectionState === 'connected' && (
            <Button size="sm" variant="destructive" onClick={handleDisconnect} title="Disconnect">
              <MonitorOff className="h-4 w-4" />
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-muted/30 border-b space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">WebSocket URL:</span>
            <code className="text-xs bg-background px-2 py-1 rounded">{wsUrl || 'Not configured'}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">noVNC Library:</span>
            <code className="text-xs bg-background px-2 py-1 rounded">
              {noVNCLoaded ? '✓ Loaded' : '⏳ Loading...'}
            </code>
          </div>
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs">
            <p className="font-semibold mb-1">💡 Setup Required:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Install websockify: <code>sudo apt install websockify</code></li>
              <li>Start proxy: <code>websockify 6080 localhost:5901</code></li>
              <li>Configure wsUrl prop to point to <code>ws://localhost:6080</code></li>
            </ol>
          </div>
        </div>
      )}

      {/* VNC Display */}
      <div 
        ref={canvasRef}
        className="flex-1 bg-black relative overflow-hidden"
        style={{ minHeight: '400px' }}
      >
        {connectionState === 'disconnected' && !wsUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MonitorOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">VNC Not Configured</p>
              <p className="text-sm mt-2">WebSocket URL is required</p>
            </div>
          </div>
        )}
        {connectionState === 'disconnected' && wsUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MonitorOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Not Connected</p>
              <p className="text-sm mt-2">Click Connect to start VNC session</p>
            </div>
          </div>
        )}
        {connectionState === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-destructive">
              <MonitorOff className="h-16 w-16 mx-auto mb-4" />
              <p className="text-lg font-medium">Connection Failed</p>
              <p className="text-sm mt-2">Check VNC server and websockify proxy</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
