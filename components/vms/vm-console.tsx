'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Monitor } from 'lucide-react';

interface VMConsoleProps {
  vmName: string;
  vncUrl?: string;
   vncPath?: string;
   vncPopupUrl?: string;
  spiceHost?: string;
  spicePort?: number;
  spicePassword?: string;
  onDisconnect?: () => void;
  onRequestPopupSession?: () => Promise<{ popupUrl?: string; wsPath?: string } | null>;
  className?: string;
}

export function VMConsole({ 
  vmName, 
  vncUrl, 
  vncPath,
  vncPopupUrl,
  spiceHost, 
  spicePort = 5900,
  spicePassword,
  onDisconnect, 
  onRequestPopupSession,
  className 
}: VMConsoleProps) {
  const [protocol, setProtocol] = useState<'vnc' | 'spice'>((vncUrl || vncPath) ? 'vnc' : 'spice');
  const [vncFailed, setVncFailed] = useState(false);

  // Use PUBLIC_HOST from environment if spiceHost is not provided or is a local address
  const effectiveSpiceHost = spiceHost && 
    spiceHost !== '0.0.0.0' && 
    spiceHost !== '127.0.0.1' && 
    spiceHost !== 'localhost' 
      ? spiceHost 
      : (typeof window !== 'undefined' ? window.location.hostname : 'localhost');

  // Check if both protocols are available
  const hasVnc = Boolean(vncUrl || vncPath);
  const hasSpice = !!effectiveSpiceHost && !!spicePort;
  const hasBoth = hasVnc && hasSpice;
  const allowSpiceFallback = !hasVnc || vncFailed;

  if (!hasVnc && !hasSpice) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-[600px]">
          <div className="text-center">
            <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              No console connection configured
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Please configure VNC or SPICE settings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If only one protocol is available, render it directly without tabs
  if (!hasBoth) {
    return (
      <div className={className}>
        {hasVnc ? (
          <VNCConsoleWrapper 
            vmName={vmName} 
            wsUrl={vncUrl}
            wsPath={vncPath}
            popupUrl={vncPopupUrl}
            onDisconnect={onDisconnect}
            onRequestPopupSession={onRequestPopupSession}
            onConnectionStateChange={(state) => {
              if (state === 'failed') {
                setVncFailed(true);
              } else if (state === 'connected') {
                setVncFailed(false);
              }
            }}
          />
        ) : (
          <SpiceConsoleWrapper
            vmName={vmName}
            host={effectiveSpiceHost}
            port={spicePort}
            password={spicePassword}
            onDisconnect={onDisconnect}
          />
        )}
      </div>
    );
  }

  // Both protocols available - show tabs
  return (
    <div className={className}>
      <Tabs value={protocol} onValueChange={(v) => setProtocol(v as 'vnc' | 'spice')}>
        <TabsList className="mb-2">
          <TabsTrigger value="vnc">VNC</TabsTrigger>
          <TabsTrigger value="spice" disabled={!allowSpiceFallback}>SPICE</TabsTrigger>
        </TabsList>

        <TabsContent value="vnc" className="mt-0">
          <VNCConsoleWrapper 
            vmName={vmName} 
            wsUrl={vncUrl}
            wsPath={vncPath}
            popupUrl={vncPopupUrl}
            onDisconnect={onDisconnect}
            onRequestPopupSession={onRequestPopupSession}
            onConnectionStateChange={(state) => {
              if (state === 'failed') {
                setVncFailed(true);
              } else if (state === 'connected') {
                setVncFailed(false);
              }
            }}
          />
          {hasSpice && !allowSpiceFallback && (
            <p className="mt-2 text-xs text-muted-foreground">
              SPICE will become available if the VNC session cannot be established.
                  wsUrl={vncUrl}
          )}
        </TabsContent>

        <TabsContent value="spice" className="mt-0">
          <SpiceConsoleWrapper
            vmName={vmName}
            host={effectiveSpiceHost}
            port={spicePort}
            password={spicePassword}
            onDisconnect={onDisconnect}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Wrapper components to handle lazy loading
function VNCConsoleWrapper({
  vmName,
  wsUrl,
  wsPath,
  popupUrl,
  onDisconnect,
  onRequestPopupSession,
  onConnectionStateChange,
}: {
  vmName: string;
  wsUrl?: string;
  wsPath?: string;
  popupUrl?: string;
  onDisconnect?: () => void;
  onRequestPopupSession?: () => Promise<{ popupUrl?: string; wsPath?: string } | null>;
  onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
}) {
  const [VNCConsole, setVNCConsole] = useState<React.ComponentType<{
    vmName: string;
    wsUrl?: string;
    wsPath?: string;
    popupUrl?: string;
    onDisconnect?: () => void;
    onRequestPopupSession?: () => Promise<{ popupUrl?: string; wsPath?: string } | null>;
    onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
    className?: string;
  }> | null>(null);

  useEffect(() => {
    import('./vnc-console').then((mod) => {
      setVNCConsole(() => mod.VNCConsole);
    });
  }, []);

  if (!VNCConsole) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-muted">
        <div className="text-center">
          <Monitor className="h-8 w-8 animate-pulse mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading VNC console...</p>
        </div>
      </div>
    );
  }

  return (
    <VNCConsole
      vmName={vmName}
      wsUrl={wsUrl}
      wsPath={wsPath}
      popupUrl={popupUrl}
      onDisconnect={onDisconnect}
      onRequestPopupSession={onRequestPopupSession}
      onConnectionStateChange={onConnectionStateChange}
    />
  );
}

function SpiceConsoleWrapper({ 
  vmName, 
  host, 
  port, 
  password, 
  onDisconnect 
}: { 
  vmName: string; 
  host: string; 
  port: number; 
  password?: string; 
  onDisconnect?: () => void;
}) {
  const [SpiceConsole, setSpiceConsole] = useState<React.ComponentType<{
    vmName: string;
    host: string;
    port: number;
    password?: string;
    onDisconnect?: () => void;
    className?: string;
  }> | null>(null);

  useEffect(() => {
    import('./spice-console').then((mod) => {
      setSpiceConsole(() => mod.SpiceConsole);
    });
  }, []);

  if (!SpiceConsole) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-muted">
        <div className="text-center">
          <Monitor className="h-8 w-8 animate-pulse mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading SPICE console...</p>
        </div>
      </div>
    );
  }

  return (
    <SpiceConsole 
      vmName={vmName} 
      host={host} 
      port={port} 
      password={password} 
      onDisconnect={onDisconnect} 
    />
  );
}
