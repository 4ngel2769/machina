'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Play,
  Square,
  Pause,
  Trash2,
  Edit,
  Monitor,
  Loader2,
  Cpu,
  MemoryStick,
  HardDrive,
  Network as NetworkIcon,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVMs } from '@/hooks/use-vms';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Dynamically import VMConsole to avoid SSR issues with noVNC/SPICE
const VMConsole = dynamic(
  () => import('@/components/vms/vm-console').then(mod => ({ default: mod.VMConsole })),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[600px] bg-muted">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
);

export default function VMDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const vmName = params.name as string;
  
  const { vms, startVM, stopVM, pauseVM, resumeVM, deleteVM, fetchVMs } = useVMs();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [displayConfig, setDisplayConfig] = useState<{ vnc?: { port: number; listen: string }; spice?: { port: number; listen: string } } | null>(null);

  // Derive VM from vms array instead of storing in state
  const vm = vms.find(v => v.name === vmName || v.id === vmName) || null;
  const isLoading = !vm && vms.length === 0;

  useEffect(() => {
    fetchVMs();
  }, [fetchVMs]);

  // Fetch display configuration when VM is running
  useEffect(() => {
    const fetchDisplayConfig = async () => {
      if (!vm || vm.status !== 'running') {
        setTimeout(() => setDisplayConfig(null), 0);
        return;
      }

      try {
        const response = await fetch(`/api/vms/${encodeURIComponent(vm.name)}/display`);
        if (response.ok) {
          const config = await response.json();
          setTimeout(() => setDisplayConfig(config), 0);
          console.log('[Display Config]', config);
        } else {
          console.error('Failed to fetch display config:', await response.text());
        }
      } catch (error) {
        console.error('Error fetching display config:', error);
      }
    };

    fetchDisplayConfig();
  }, [vm]);

  const handleStart = async () => {
    if (!vm) return;
    await startVM(vm.id);
    toast.success(`Starting ${vm.name}...`);
  };

  const handleStop = async () => {
    if (!vm) return;
    await stopVM(vm.id);
    toast.success(`Stopping ${vm.name}...`);
  };

  const handlePause = async () => {
    if (!vm) return;
    await pauseVM(vm.id);
    toast.success(`Pausing ${vm.name}...`);
  };

  const handleResume = async () => {
    if (!vm) return;
    await resumeVM(vm.id);
    toast.success(`Resuming ${vm.name}...`);
  };

  const handleDelete = async () => {
    if (!vm) return;
    setIsDeleting(true);
    try {
      await deleteVM(vm.id);
      toast.success(`VM ${vm.name} deleted`);
      router.push('/vms');
    } catch {
      toast.error('Failed to delete VM');
      setIsDeleting(false);
    }
  };

  const handleOpenConsole = () => {
    router.push(`/vms/${vmName}/console`);
  };

  const handleEdit = () => {
    router.push(`/vms/${vmName}/edit`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="container max-w-6xl mx-auto py-8">
        <p>VM not found</p>
        <Button onClick={() => router.push('/vms')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to VMs
        </Button>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (vm.status) {
      case 'running':
        return <Badge className="bg-green-500">Running</Badge>;
      case 'paused':
      case 'suspended':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Paused</Badge>;
      case 'stopped':
      case 'shut off':
        return <Badge variant="secondary">Stopped</Badge>;
      default:
        return <Badge variant="destructive">Crashed</Badge>;
    }
  };

  const isRunning = vm.status === 'running';
  const isStopped = vm.status === 'stopped' || vm.status === 'shut off';
  const isPaused = vm.status === 'paused' || vm.status === 'suspended';

  return (
    <div className="container max-w-6xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/vms')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{vm.name}</h1>
            <p className="text-muted-foreground">{vm.os_variant || 'Virtual Machine'}</p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {isStopped && (
              <Button onClick={handleStart} size="sm">
                <Play className="h-4 w-4 mr-2" />
                Start
              </Button>
            )}
            {isRunning && (
              <>
                <Button onClick={handlePause} size="sm" variant="outline">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
                <Button onClick={handleStop} size="sm" variant="outline">
                  <Square className="h-4 w-4 mr-2" />
                  Shutdown
                </Button>
              </>
            )}
            {isPaused && (
              <Button onClick={handleResume} size="sm">
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            )}
            <Button onClick={handleOpenConsole} size="sm" variant="outline" disabled={isStopped}>
              <Monitor className="h-4 w-4 mr-2" />
              Open Console
            </Button>
            <Button onClick={handleEdit} size="sm" variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit Configuration
            </Button>
            <Button onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="console" disabled={isStopped}>Console</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>VM Specifications</CardTitle>
              <CardDescription>Virtual machine resource allocation and status</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                  <Cpu className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">vCPUs</p>
                  <p className="text-2xl font-bold">{vm.vcpus}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-md">
                  <MemoryStick className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Memory</p>
                  <p className="text-2xl font-bold">{vm.memory} MB</p>
                </div>
              </div>

              {vm.disk_size && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md">
                    <HardDrive className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Disk Size</p>
                    <p className="text-2xl font-bold">{vm.disk_size} GB</p>
                  </div>
                </div>
              )}

              {vm.uptime !== undefined && isRunning && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Uptime</p>
                    <p className="text-2xl font-bold">{Math.floor(Number(vm.uptime) / 3600)}h</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resource Usage */}
          {(vm.cpu_usage !== undefined || vm.memory_usage !== undefined) && (
            <Card>
              <CardHeader>
                <CardTitle>Resource Usage</CardTitle>
                <CardDescription>Current resource utilization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {vm.cpu_usage !== undefined && (
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">CPU Usage</span>
                      <span className="text-sm font-medium">{vm.cpu_usage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(vm.cpu_usage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {vm.memory_usage !== undefined && (
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm">Memory Usage</span>
                      <span className="text-sm font-medium">{vm.memory_usage.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all"
                        style={{ width: `${Math.min(vm.memory_usage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Console Tab */}
        <TabsContent value="console" className="space-y-4">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {isRunning && displayConfig ? (
                <div className="h-[600px]">
                  <VMConsole
                    vmName={vm.name}
                    vncUrl={displayConfig.vnc ? `ws://localhost:${displayConfig.vnc.port}` : undefined}
                    spiceHost={displayConfig.spice ? displayConfig.spice.listen : undefined}
                    spicePort={displayConfig.spice?.port}
                    className="h-full"
                  />
                </div>
              ) : isRunning && !displayConfig ? (
                <div className="flex items-center justify-center h-[600px] bg-muted">
                  <div className="text-center">
                    <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      Loading display configuration...
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Detecting VNC/SPICE settings
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[600px] bg-muted">
                  <div className="text-center">
                    <Monitor className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium text-muted-foreground mb-2">
                      VM is not running
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Start the VM to access the console
                    </p>
                    <Button onClick={handleStart} size="sm">
                      <Play className="h-4 w-4 mr-2" />
                      Start VM
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hardware Tab */}
        <TabsContent value="hardware" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hardware Configuration</CardTitle>
              <CardDescription>Virtual hardware details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">CPU Cores:</span>
                  <span className="ml-2 font-medium">{vm.vcpus}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Memory:</span>
                  <span className="ml-2 font-medium">{vm.memory} MB</span>
                </div>
                {vm.disk_size && (
                  <div>
                    <span className="text-muted-foreground">Disk Size:</span>
                    <span className="ml-2 font-medium">{vm.disk_size} GB</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">OS Variant:</span>
                  <span className="ml-2 font-medium">{vm.os_variant || 'Unknown'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Tab */}
        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Interfaces</CardTitle>
              <CardDescription>Virtual network configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                <NetworkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Network information not yet available</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Virtual Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{vm.name}</strong>? This action cannot be undone.
              All disk images and configuration will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete VM'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
