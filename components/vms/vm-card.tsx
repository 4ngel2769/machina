'use client';

import { VirtualMachine } from '@/types/vm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Progress } from '@/components/ui/progress';
import { useVMs } from '@/hooks/use-vms';
import { 
  MoreVertical, 
  Play, 
  Pause, 
  RotateCcw, 
  Trash2,
  Cpu,
  HardDrive,
  MemoryStick,
  Power,
  PowerOff,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn, formatBytes } from '@/lib/utils';
import type { VMStats } from '@/types/stats';

interface VMCardProps {
  vm: VirtualMachine;
  liveStats?: VMStats; // Real-time stats from live feed
}

export function VMCard({ vm, liveStats }: VMCardProps) {
  const { startVM, stopVM, forceStopVM, pauseVM, resumeVM, deleteVM } = useVMs();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Get status badge variant
  const getStatusBadge = (status: VirtualMachine['status']) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-500 hover:bg-green-600">Running</Badge>;
      case 'paused':
      case 'suspended':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Paused</Badge>;
      case 'shut off':
      case 'stopped':
        return <Badge variant="secondary">Stopped</Badge>;
      case 'crashed':
        return <Badge variant="destructive">Crashed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Handle actions with loading state
  const handleAction = async (action: () => Promise<void>, successMessage: string) => {
    setIsActionLoading(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDelete = async () => {
    await handleAction(
      () => deleteVM(vm.id),
      `VM "${vm.name}" deleted successfully`
    );
    setDeleteDialogOpen(false);
  };

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {vm.name}
                {getStatusBadge(vm.status)}
              </CardTitle>
              <CardDescription className="mt-1">
                {vm.os_variant || 'Unknown OS'}
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" disabled={isActionLoading}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Start/Stop/Pause Actions */}
                {vm.status === 'running' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => handleAction(
                        () => pauseVM(vm.id),
                        'VM paused'
                      )}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleAction(
                        () => stopVM(vm.id),
                        'VM shutdown initiated'
                      )}
                    >
                      <PowerOff className="h-4 w-4 mr-2" />
                      Shutdown
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleAction(
                        () => forceStopVM(vm.id),
                        'VM force stopped'
                      )}
                      className="text-destructive"
                    >
                      <Power className="h-4 w-4 mr-2" />
                      Force Stop
                    </DropdownMenuItem>
                  </>
                )}
                
                {(vm.status === 'paused' || vm.status === 'suspended') && (
                  <DropdownMenuItem
                    onClick={() => handleAction(
                      () => resumeVM(vm.id),
                      'VM resumed'
                    )}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </DropdownMenuItem>
                )}
                
                {(vm.status === 'shut off' || vm.status === 'stopped') && (
                  <DropdownMenuItem
                    onClick={() => handleAction(
                      () => startVM(vm.id),
                      'VM started'
                    )}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </DropdownMenuItem>
                )}
                
                <DropdownMenuItem
                  onClick={() => handleAction(
                    async () => {
                      await stopVM(vm.id);
                      setTimeout(() => startVM(vm.id), 2000);
                    },
                    'VM restart initiated'
                  )}
                  disabled={vm.status !== 'running'}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restart
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* VM Specifications */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{vm.vcpus} vCPUs</span>
            </div>
            <div className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{vm.memory} MB</span>
            </div>
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{vm.disk_size} GB</span>
            </div>
          </div>

          {/* Resource Usage - Enhanced with real-time stats */}
          {(vm.status === 'running' || vm.status === 'paused' || vm.status === 'suspended') && (
            <div className="space-y-3 pt-3 border-t">
              {/* CPU Usage */}
              {(liveStats?.cpu !== undefined || vm.cpu_usage !== undefined) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">CPU</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {(liveStats?.cpu ?? vm.cpu_usage ?? 0).toFixed(1)}%
                      </span>
                      {(liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 95 && (
                        <Badge variant="destructive" className="h-4 text-[10px] px-1">
                          Critical
                        </Badge>
                      )}
                      {(liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 80 && 
                       (liveStats?.cpu ?? vm.cpu_usage ?? 0) < 95 && (
                        <Badge variant="warning" className="h-4 text-[10px] px-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          High
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={liveStats?.cpu ?? vm.cpu_usage ?? 0}
                    className={cn(
                      "h-2 transition-all duration-500",
                      (liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 95 && "bg-red-950/20",
                      (liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 80 &&
                        (liveStats?.cpu ?? vm.cpu_usage ?? 0) < 95 && "bg-yellow-950/20"
                    )}
                    indicatorClassName={cn(
                      "transition-all duration-500",
                      (liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 95 && "bg-red-500",
                      (liveStats?.cpu ?? vm.cpu_usage ?? 0) >= 80 &&
                        (liveStats?.cpu ?? vm.cpu_usage ?? 0) < 95 && "bg-yellow-500",
                      (liveStats?.cpu ?? vm.cpu_usage ?? 0) < 80 && "bg-blue-500"
                    )}
                  />
                </div>
              )}

              {/* Memory Usage */}
              {(liveStats?.memory !== undefined || vm.memory_usage !== undefined) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Memory</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {(liveStats?.memory ?? vm.memory_usage ?? 0).toFixed(1)}%
                      </span>
                      {(liveStats?.memory ?? vm.memory_usage ?? 0) >= 95 && (
                        <Badge variant="destructive" className="h-4 text-[10px] px-1">
                          Critical
                        </Badge>
                      )}
                      {(liveStats?.memory ?? vm.memory_usage ?? 0) >= 80 && 
                       (liveStats?.memory ?? vm.memory_usage ?? 0) < 95 && (
                        <Badge variant="warning" className="h-4 text-[10px] px-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          High
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={liveStats?.memory ?? vm.memory_usage ?? 0}
                    className={cn(
                      "h-2 transition-all duration-500",
                      (liveStats?.memory ?? vm.memory_usage ?? 0) >= 95 && "bg-red-950/20",
                      (liveStats?.memory ?? vm.memory_usage ?? 0) >= 80 &&
                        (liveStats?.memory ?? vm.memory_usage ?? 0) < 95 && "bg-yellow-950/20"
                    )}
                    indicatorClassName={cn(
                      "transition-all duration-500",
                      (liveStats?.memory ?? vm.memory_usage ?? 0) >= 95 && "bg-red-500",
                      (liveStats?.memory ?? vm.memory_usage ?? 0) >= 80 &&
                        (liveStats?.memory ?? vm.memory_usage ?? 0) < 95 && "bg-yellow-500",
                      (liveStats?.memory ?? vm.memory_usage ?? 0) < 80 && "bg-blue-500"
                    )}
                  />
                </div>
              )}

              {/* Disk I/O */}
              {liveStats?.diskRead !== undefined && liveStats?.diskWrite !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Disk I/O</span>
                    <span className="font-medium text-[10px]">
                      R {formatBytes(liveStats.diskRead)} / W {formatBytes(liveStats.diskWrite)}
                    </span>
                  </div>
                  <div className="flex gap-1 h-1.5">
                    <div className="flex-1 bg-purple-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                    <div className="flex-1 bg-orange-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Network I/O */}
              {liveStats?.networkRx !== undefined && liveStats?.networkTx !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Network I/O</span>
                    <span className="font-medium text-[10px]">
                      ↓ {formatBytes(liveStats.networkRx)} / ↑ {formatBytes(liveStats.networkTx)}
                    </span>
                  </div>
                  <div className="flex gap-1 h-1.5">
                    <div className="flex-1 bg-green-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                    <div className="flex-1 bg-blue-500/20 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: '100%' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Uptime (if available) */}
          {vm.uptime && (
            <div className="text-xs text-muted-foreground">
              Uptime: {vm.uptime}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Virtual Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{vm.name}</strong>?
              This action cannot be undone and will remove all associated storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
