'use client';

import { useEffect, useState, Suspense } from 'react';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  Play, 
  Square, 
  RotateCw, 
  Trash2,
  Terminal as TerminalIcon,
  FileText,
  Activity,
  Box
} from 'lucide-react';
import { toast } from 'sonner';
import { Container } from '@/types/container';

// Terminal component (we'll inline a simpler version)
import dynamic from 'next/dynamic';

const ContainerTerminal = dynamic(
  () => import('@/components/containers/container-terminal').then(mod => ({ default: mod.ContainerTerminal })),
  { ssr: false, loading: () => <Skeleton className="h-[600px] w-full" /> }
);

const ContainerLogs = dynamic(
  () => import('@/components/containers/container-logs').then(mod => ({ default: mod.ContainerLogs })),
  { ssr: false, loading: () => <Skeleton className="h-[600px] w-full" /> }
);

const ContainerStats = dynamic(
  () => import('@/components/containers/container-stats').then(mod => ({ default: mod.ContainerStats })),
  { ssr: false, loading: () => <Skeleton className="h-[400px] w-full" /> }
);

function ContainerDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [container, setContainer] = useState<Container | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContainer();
    const interval = setInterval(fetchContainer, 5000);
    return () => clearInterval(interval);
  }, [resolvedParams.id]);

  const fetchContainer = async () => {
    try {
      const response = await fetch(`/api/containers/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setContainer(data.container);
      }
    } catch (error) {
      console.error('Error fetching container:', error);
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (action: 'start' | 'stop' | 'restart') => {
    try {
      const response = await fetch(`/api/containers/${resolvedParams.id}/${action}`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success(`Container ${action}ed successfully`);
        fetchContainer();
      } else {
        const error = await response.json();
        toast.error(error.error || `Failed to ${action} container`);
      }
    } catch {
      toast.error(`Failed to ${action} container`);
    }
  };

  const deleteContainer = async () => {
    if (!confirm('Are you sure you want to delete this container? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/containers/${resolvedParams.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Container deleted successfully');
        router.push('/containers');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to delete container');
      }
    } catch {
      toast.error('Failed to delete container');
    }
  };

  if (loading) {
    return (
      <div className="container max-w-7xl py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!container) {
    return (
      <div className="container max-w-7xl py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <Box className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">Container not found</p>
            <Button className="mt-4" onClick={() => router.push('/containers')}>
              Back to Containers
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/containers')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{container.name}</h1>
            <p className="text-muted-foreground">{container.image}</p>
          </div>
          <Badge variant={container.state === 'running' ? 'default' : 'secondary'}>
            {container.state}
          </Badge>
        </div>
        <div className="flex gap-2">
          {container.state === 'running' ? (
            <>
              <Button variant="outline" onClick={() => performAction('restart')}>
                <RotateCw className="mr-2 h-4 w-4" />
                Restart
              </Button>
              <Button variant="outline" onClick={() => performAction('stop')}>
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </>
          ) : (
            <Button onClick={() => performAction('start')}>
              <Play className="mr-2 h-4 w-4" />
              Start
            </Button>
          )}
          <Button variant="destructive" onClick={deleteContainer}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Container ID</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-mono text-muted-foreground">{container.id.slice(0, 12)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{container.state}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Image</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm truncate">{container.image}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {new Date(container.created * 1000).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="terminal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="terminal">
            <TerminalIcon className="h-4 w-4 mr-2" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="logs">
            <FileText className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="stats">
            <Activity className="h-4 w-4 mr-2" />
            Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="terminal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Interactive Terminal</CardTitle>
              <CardDescription>
                Full shell access to the container
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContainerTerminal containerId={container.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Container Logs</CardTitle>
              <CardDescription>
                View real-time logs from the container
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContainerLogs containerId={container.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <ContainerStats container={container} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ContainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-96 w-full" /></div>}>
      <ContainerDetailContent params={params} />
    </Suspense>
  );
}
