// will add a switch for vnc/console/spice

'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Lazy load VNC console to reduce initial bundle size
const VNCConsole = dynamic(
  () => import('@/components/vms/vnc-console').then(mod => ({ default: mod.VNCConsole })),
  {
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    ),
    ssr: false,
  }
);

export default function VMConsolePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const vmName = params.id as string;
  const [sessionInfo, setSessionInfo] = useState<{ wsPath: string; popupUrl?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeVNC = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const encodedVm = encodeURIComponent(vmName);
        const preSharedToken = searchParams.get('session');

        // Check if a proxy is already running (issue session only if we don't already have a token)
        const statusRes = await fetch(`/api/vms/${encodedVm}/proxy?issueSession=${preSharedToken ? '0' : '1'}`);
        const statusData = await statusRes.json();

        let session = statusData.session;

        if (!statusData.active) {
          // Need to fetch display config to determine VNC port
          const displayRes = await fetch(`/api/vms/${encodedVm}/display`);
          if (!displayRes.ok) {
            const data = await displayRes.json();
            throw new Error(data.error || 'Failed to determine display configuration');
          }

          const displayConfig = await displayRes.json();
          if (!displayConfig?.vnc?.port) {
            throw new Error('VNC is not configured for this VM');
          }

          const startRes = await fetch(`/api/vms/${encodedVm}/proxy?issueSession=1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vncPort: displayConfig.vnc.port,
              listen: displayConfig.vnc.listen,
            }),
          });

          if (!startRes.ok) {
            const data = await startRes.json();
            throw new Error(data.error || 'Failed to start VNC proxy');
          }

          const startData = await startRes.json();
          session = startData.session;
        } else if (!session && !preSharedToken) {
          // Explicitly request a session if status didn't include one
          const sessionRes = await fetch(`/api/vms/${encodedVm}/proxy/session`, { method: 'POST' });
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            session = sessionData.session;
          }
        }

        if (!session && preSharedToken) {
          session = {
            token: preSharedToken,
            wsPath: `/api/vms/${encodedVm}/console/ws?token=${preSharedToken}`,
            popupUrl: `/vms/${encodedVm}/console?popup=1&session=${preSharedToken}`,
            expiresAt: '',
          };
        }

        if (!session?.wsPath) {
          throw new Error('Failed to provision a secure VNC session');
        }

        setSessionInfo({ wsPath: session.wsPath, popupUrl: session.popupUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize VNC';
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    };

    initializeVNC();
  }, [vmName, searchParams]);

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

  if (error || !sessionInfo?.wsPath) {
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
          wsPath={sessionInfo.wsPath}
          onDisconnect={handleDisconnect}
          className="h-full"
        />
      </div>
    </div>
  );
}
