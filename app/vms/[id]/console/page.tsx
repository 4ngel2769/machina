// will add a switch for vnc/console/spice

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { VNCConsole } from '@/components/vms/vnc-console';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function VMConsolePage() {
  const params = useParams();
  const router = useRouter();
  const vmName = params.id as string;
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeVNC = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // First, get VNC info
        const infoRes = await fetch(`/api/vms/${vmName}/vnc`);
        if (!infoRes.ok) {
          const data = await infoRes.json();
          throw new Error(data.error || 'Failed to get VNC info');
        }

        // Start websockify proxy
        const proxyRes = await fetch(`/api/vms/${vmName}/vnc`, {
          method: 'POST',
        });

        if (!proxyRes.ok) {
          const data = await proxyRes.json();
          throw new Error(data.error || 'Failed to start VNC proxy');
        }

        const proxyData = await proxyRes.json();
        setWsUrl(proxyData.wsUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize VNC';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    initializeVNC();

    // Cleanup: stop proxy when leaving page
    return () => {
      fetch(`/api/vms/${vmName}/vnc`, { method: 'DELETE' }).catch(console.error);
    };
  }, [vmName]);

  const handleDisconnect = () => {
    router.push(`/vms/${vmName}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <h2 className="text-xl font-semibold">Connecting to {vmName}...</h2>
          <p className="text-muted-foreground">Starting VNC proxy</p>
        </div>
      </div>
    );
  }

  if (error || !wsUrl) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-destructive text-6xl">⚠️</div>
          <h2 className="text-xl font-semibold">Connection Failed</h2>
          <p className="text-muted-foreground">{error || 'Failed to establish VNC connection'}</p>
          <div className="space-x-2">
            <Button onClick={() => router.push(`/vms/${vmName}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to VM Details
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between p-2 bg-card border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/vms/${vmName}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to VM
        </Button>
        <h1 className="text-lg font-semibold">
          Console: {vmName}
        </h1>
        <div className="w-24" /> {/* Spacer for centering */}
      </div>

      {/* VNC Console */}
      <div className="flex-1 overflow-hidden">
        <VNCConsole
          vmName={vmName}
          wsUrl={wsUrl}
          onDisconnect={handleDisconnect}
          className="h-full"
        />
      </div>
    </div>
  );
}
