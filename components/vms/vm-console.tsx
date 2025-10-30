'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Monitor } from 'lucide-react';

interface VMConsoleProps {
  vmName: string;
  vncUrl?: string;
  spiceHost?: string;
  spicePort?: number;
  spicePassword?: string;
  onDisconnect?: () => void;
  className?: string;
}

export function VMConsole({ 
  vmName, 
  vncUrl, 
  spiceHost = 'localhost', 
  spicePort = 5900,
  spicePassword,
  onDisconnect, 
  className 
}: VMConsoleProps) {
  const [protocol, setProtocol] = useState<'vnc' | 'spice'>(vncUrl ? 'vnc' : 'spice');

  // Check if both protocols are available
  const hasVnc = !!vncUrl;
  const hasSpice = !!spiceHost && !!spicePort;
  const hasBoth = hasVnc && hasSpice;

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
            wsUrl={vncUrl!} 
            onDisconnect={onDisconnect} 
          />
        ) : (
          <SpiceConsoleWrapper
            vmName={vmName}
            host={spiceHost}
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
          <TabsTrigger value="spice">SPICE</TabsTrigger>
        </TabsList>

        <TabsContent value="vnc" className="mt-0">
          <VNCConsoleWrapper 
            vmName={vmName} 
            wsUrl={vncUrl!} 
            onDisconnect={onDisconnect} 
          />
        </TabsContent>

        <TabsContent value="spice" className="mt-0">
          <SpiceConsoleWrapper
            vmName={vmName}
            host={spiceHost}
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
function VNCConsoleWrapper({ vmName, wsUrl, onDisconnect }: { vmName: string; wsUrl: string; onDisconnect?: () => void }) {
  const [VNCConsole, setVNCConsole] = useState<React.ComponentType<{
    vmName: string;
    wsUrl: string;
    onDisconnect?: () => void;
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

  return <VNCConsole vmName={vmName} wsUrl={wsUrl} onDisconnect={onDisconnect} />;
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
