'use client';

import { useRouter } from 'next/navigation';
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

const STATS_READY_STATES: Set<VirtualMachine['status']> = new Set(['running', 'paused', 'suspended']);

function UsageStatBar({
  label,
  value,
  isActive,
  placeholder,
}: {
  label: string;
  value: number;
  isActive: boolean;
  placeholder: string;
}) {
  const critical = value >= 95;
  const high = value >= 80 && value < 95;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn('font-medium', !isActive && 'text-muted-foreground/70')}>
            {isActive ? `${value.toFixed(1)}%` : placeholder}
          </span>
          {isActive && critical && (
            <Badge variant="destructive" className="h-4 text-[10px] px-1">
              Critical
            </Badge>
          )}
          {isActive && high && (
            <Badge variant="outline" className="h-4 text-[10px] px-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              High
            </Badge>
          )}
        </div>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden bg-muted/30">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            !isActive && 'bg-muted-foreground/30',
            isActive && critical && 'bg-red-500',
            isActive && high && 'bg-yellow-500',
            isActive && !critical && !high && 'bg-blue-500'
          )}
          style={{ width: isActive ? `${Math.min(value, 100)}%` : '0%' }}
        />
      </div>
    </div>
  );
}

function InlineMetric({
  label,
  value,
  isActive,
}: {
  label: string;
  value: string;
  isActive: boolean;
}) {
  return (
    <div className="space-y-1 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className={cn('font-medium text-foreground/80', !isActive && 'text-muted-foreground/70')}>
          {value}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
        <div
          className={cn('h-full transition-all duration-500', isActive ? 'bg-gradient-to-r from-primary to-blue-500' : 'bg-muted-foreground/30')}
          style={{ width: isActive ? '100%' : '0%' }}
        />
      </div>
    </div>
  );
}

interface VMCardProps {
  vm: VirtualMachine;
  liveStats?: VMStats; // Real-time stats from live feed
}

export function VMCard({ vm, liveStats }: VMCardProps) {
  const router = useRouter();
  const { startVM, stopVM, forceStopVM, pauseVM, resumeVM, deleteVM } = useVMs();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const statsReady = STATS_READY_STATES.has(vm.status);

  const cpuFromLive = typeof liveStats?.cpu?.usage === 'number' ? liveStats.cpu.usage : undefined;
  const cpuValue = statsReady ? (cpuFromLive ?? vm.cpu_usage ?? 0) : 0;
  const cpuActive = statsReady && (typeof cpuFromLive === 'number' || typeof vm.cpu_usage === 'number');

  const memoryFromLive = typeof liveStats?.memory?.percentage === 'number' ? liveStats.memory.percentage : undefined;
  const memoryValue = statsReady ? (memoryFromLive ?? vm.memory_usage ?? 0) : 0;
  const memoryActive = statsReady && (typeof memoryFromLive === 'number' || typeof vm.memory_usage === 'number');

  const diskActive = statsReady && !!liveStats?.disk;
  const diskLabel = diskActive
    ? `R ${formatBytes(liveStats!.disk.read)} / W ${formatBytes(liveStats!.disk.write)}`
    : statsReady ? 'Collecting…' : 'Offline';

  const networkActive = statsReady && !!liveStats?.network;
  const networkLabel = networkActive
    ? `↓ ${formatBytes(liveStats!.network.rx)} / ↑ ${formatBytes(liveStats!.network.tx)}`
    : statsReady ? 'Collecting…' : 'Offline';

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
      <Card 
        className="hover:shadow-lg transition-shadow cursor-pointer" 
        onClick={() => router.push(`/vms/${encodeURIComponent(vm.name)}`)}
      >
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  disabled={isActionLoading}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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

          {/* Resource Usage - always rendered with graceful placeholders */}
          <div className="space-y-3 pt-3 border-t">
            <UsageStatBar
              label="CPU"
              value={cpuValue}
              isActive={cpuActive}
              placeholder={statsReady ? 'Collecting…' : 'Offline'}
            />
            <UsageStatBar
              label="Memory"
              value={memoryValue}
              isActive={memoryActive}
              placeholder={statsReady ? 'Collecting…' : 'Offline'}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InlineMetric label="Disk I/O" value={diskLabel} isActive={diskActive} />
              <InlineMetric label="Network I/O" value={networkLabel} isActive={networkActive} />
            </div>
          </div>

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
