'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import type RFB from '@novnc/novnc/lib/rfb.js';
import type { RFBEvent } from '@novnc/novnc/lib/rfb.js';

// Dynamically import RFB from noVNC (client-side only)
const loadRFB = async () => {
  const RFB = (await import('@novnc/novnc/lib/rfb.js')).default;
  return RFB;
};

interface VNCConsoleProps {
  vmName: string;
  wsUrl?: string;
  wsPath?: string;
  popupUrl?: string;
  onDisconnect?: () => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'failed';
type ScaleMode = 'remote' | 'local' | 'auto' | 'none';

export function VNCConsole({
  vmName,
  wsUrl,
  wsPath,
  popupUrl,
  onDisconnect,
  onConnectionStateChange,
  className,
}: VNCConsoleProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('auto');
  const [showSettings, setShowSettings] = useState(false);
  const [noVNCLoaded, setNoVNCLoaded] = useState(false);

  const resolvedWsUrl = useMemo(() => {
    if (wsUrl) {
      return wsUrl;
    }
    if (wsPath && typeof window !== 'undefined') {
      const base = window.location.origin.replace('http', 'ws');
      return `${base}${wsPath}`;
    }
    return undefined;
  }, [wsUrl, wsPath]);

  // Debug: Log wsUrl whenever it changes
  useEffect(() => {
    console.log('[VNC] Component mounted/updated. wsUrl:', resolvedWsUrl);
  }, [resolvedWsUrl]);

  useEffect(() => {
    onConnectionStateChange?.(connectionState);
  }, [connectionState, onConnectionStateChange]);

  // Load noVNC from npm package
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load RFB dynamically
    loadRFB()
      .then((RFB) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).RFB = RFB;
        console.log('[VNC] noVNC library loaded successfully from npm');
        setNoVNCLoaded(true);
      })
      .catch((error) => {
        console.error('[VNC] Failed to load noVNC library:', error);
        toast.error('Failed to load VNC library');
        setConnectionState('failed');
      });
  }, []);

  const handleDisconnect = useCallback(() => {
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect();
      } catch (_err) {
        console.error('[VNC] Disconnect error:', _err);
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

    if (!resolvedWsUrl) {
      toast.error('VNC WebSocket URL not configured');
      setConnectionState('failed');
      return;
    }

    try {
      console.log('[VNC] Connecting to:', resolvedWsUrl);
      setConnectionState('connecting');

      // Get RFB from window (loaded dynamically)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RFB = (window as any).RFB;
      if (!RFB) {
        throw new Error('noVNC RFB not available');
      }

      // Create RFB connection
      const rfb = new RFB(canvasRef.current, resolvedWsUrl, {
        credentials: { password: '' },
      });

      // Set scaling mode
      rfb.scaleViewport = scaleMode === 'remote' || scaleMode === 'local';
      rfb.resizeSession = scaleMode === 'local';

      // Enable keyboard input by setting focus to view
      rfb.focus();
      
      // Add click handler to ensure focus on canvas click
      const canvas = canvasRef.current.querySelector('canvas');
      if (canvas) {
        canvas.addEventListener('click', () => {
          rfb.focus();
        });
        // Make canvas tabbable and auto-focus
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
      }

      // Connection events
      rfb.addEventListener('connect', () => {
        console.log('[VNC] Connected successfully');
        setConnectionState('connected');
        toast.success(`Connected to ${vmName}`);
        // Focus after connection
        setTimeout(() => rfb.focus(), 100);
      });

      rfb.addEventListener('disconnect', (e: RFBEvent) => {
        console.log('[VNC] Disconnected:', e.detail);
        setConnectionState('disconnected');
        
        if (!e.detail) {
          toast.error('VNC connection lost');
        }
      });

      rfb.addEventListener('securityfailure', (e: RFBEvent) => {
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
  }, [resolvedWsUrl, vmName, scaleMode, noVNCLoaded]);

  // Auto-connect when wsUrl and noVNC are ready
  useEffect(() => {
    if (resolvedWsUrl && noVNCLoaded && canvasRef.current && connectionState === 'disconnected') {
      console.log('[VNC] Auto-connecting...');
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        connectVNC();
      }, 100);
    }
  }, [resolvedWsUrl, noVNCLoaded, connectionState, connectVNC]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rfbRef.current) {
        try {
          rfbRef.current.disconnect();
        } catch {
          // Ignore disconnect errors on cleanup
        }
        rfbRef.current = null;
      }
    };
  }, []);

  // Update scaling when mode changes
  useEffect(() => {
    if (rfbRef.current && connectionState === 'connected') {
      if (scaleMode === 'auto') {
        // Auto mode: fit to screen while maintaining aspect ratio
        rfbRef.current.scaleViewport = true;
        rfbRef.current.resizeSession = false;
        rfbRef.current.clipViewport = false;
      } else {
        rfbRef.current.scaleViewport = scaleMode === 'remote' || scaleMode === 'local';
        rfbRef.current.resizeSession = scaleMode === 'local';
      }
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
      } catch {
        toast.error('Failed to enter fullscreen');
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch {
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

  const openInNewWindow = () => {
    if (!popupUrl) {
      toast.error('Console popup URL not available');
      return;
    }
    
    // Create a standalone VNC viewer window
    const width = 1024;
    const height = 768;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    const windowFeatures = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
    const newWindow = window.open(popupUrl, `VNC_${vmName}`, windowFeatures);
    
    if (newWindow) {
      toast.success('Opened in new window');
    } else {
      toast.error('Failed to open new window. Please allow popups.');
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
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Scale: Auto</SelectItem>
                <SelectItem value="remote">Scale: Remote</SelectItem>
                <SelectItem value="local">Scale: Local</SelectItem>
                <SelectItem value="none">Scale: None</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Open in New Window */}
          <Button
            size="sm"
            variant="outline"
            onClick={openInNewWindow}
            title="Open in New Window"
            disabled={!popupUrl}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>

          {/* Controls */}
          {connectionState === 'disconnected' && (
            <Button
              size="sm"
              variant="default"
              onClick={connectVNC}
              disabled={!noVNCLoaded || !resolvedWsUrl}
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
