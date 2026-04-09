'use client';

import { Container } from '@/types/container';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Terminal,
  FileText,
  MoreVertical,
  Box,
} from 'lucide-react';
import { useState } from 'react';
import { useContainers } from '@/hooks/use-containers';
import { toast } from 'sonner';
import { cn, formatBytes } from '@/lib/utils';
import type { ContainerStats } from '@/types/stats';
import { useRouter } from 'next/navigation';

const PROTECTED_CONTAINER_NAMES = (process.env.NEXT_PUBLIC_PROTECTED_CONTAINER_NAMES ?? 'machina')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);

interface ContainerCardProps {
  container: Container;
  onTerminal?: (container: Container) => void;
  onLogs?: (container: Container) => void;
  liveStats?: ContainerStats; // Real-time stats from live feed
}

export function ContainerCard({ container, onTerminal, onLogs, liveStats }: ContainerCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { startContainer, stopContainer, restartContainer, deleteContainer, loadingActions } = useContainers();
  const router = useRouter();

  const isRunning = container.status === 'running';
  const isAmnesic = container.type === 'amnesic';
  const isProtectedContainer = PROTECTED_CONTAINER_NAMES.includes(container.name.toLowerCase());
  const cpuValue = liveStats?.cpu ?? container.cpu ?? 0;
  const hasCpuData = isRunning && (liveStats?.cpu !== undefined || container.cpu !== undefined);
  const memoryPct = typeof liveStats?.memory === 'object'
    ? liveStats.memory.percentage
    : typeof container.memory === 'number'
      ? container.memory
      : 0;
  const hasMemoryData = isRunning && (liveStats?.memory !== undefined || typeof container.memory === 'number');
  const hasNetworkData = isRunning && Boolean(liveStats?.network);
  const hasDiskData = isRunning && Boolean(liveStats?.blockIO);

  // Status badge color
  const getStatusColor = () => {
    switch (container.status) {
      case 'running':
        return 'bg-green-600 hover:bg-green-700';
      case 'exited':
      case 'stopped':
        return 'bg-gray-600 hover:bg-gray-700';
      case 'paused':
        return 'bg-yellow-600 hover:bg-yellow-700';
      case 'restarting':
        return 'bg-blue-600 hover:bg-blue-700';
      default:
        return 'bg-red-600 hover:bg-red-700';
    }
  };

  const handleCardClick = () => {
    router.push(`/containers/${container.id}`);
  };

  const preventProtectedMutation = () => {
    if (!isProtectedContainer) {
      return false;
    }
    toast.info('This container powers Machina and cannot be modified from this view.');
    return true;
  };

  const handleStart = async () => {
    try {
      await startContainer(container.id);
      toast.success(`Container "${container.name}" started`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start container');
    }
  };

  const handleStop = async () => {
    if (preventProtectedMutation()) return;
    try {
      await stopContainer(container.id);
      toast.success(`Container "${container.name}" stopped`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop container');
    }
  };

  const handleRestart = async () => {
    if (preventProtectedMutation()) return;
    try {
      await restartContainer(container.id);
      toast.success(`Container "${container.name}" restarted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restart container');
    }
  };

  const handleDelete = async () => {
    if (preventProtectedMutation()) {
      setDeleteDialogOpen(false);
      return;
    }
    try {
      await deleteContainer(container.id);
      toast.success(`Container "${container.name}" deleted`);
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete container');
    }
  };

  return (
    <>
      <Card 
        className="group relative overflow-hidden border border-border/60 bg-card/90 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
        onClick={handleCardClick}
      >
        <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-br from-primary/5 via-transparent to-transparent transition-opacity" />
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Box className="h-4 w-4 text-container-blue shrink-0" />
                <h3 className="font-semibold text-sm truncate">{container.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground truncate">{container.image}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isRunning && onTerminal && (
                  <DropdownMenuItem onClick={() => onTerminal(container)}>
                    <Terminal className="mr-2 h-4 w-4" />
                    Terminal
                  </DropdownMenuItem>
                )}
                {onLogs && (
                  <DropdownMenuItem onClick={() => onLogs(container)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Logs
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {!isRunning && (
                  <DropdownMenuItem 
                    onClick={handleStart}
                    disabled={loadingActions[`start-${container.id}`]}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {loadingActions[`start-${container.id}`] ? 'Starting...' : 'Start'}
                  </DropdownMenuItem>
                )}
                {isRunning && (
                  <DropdownMenuItem 
                    onClick={handleStop}
                    disabled={isProtectedContainer || loadingActions[`stop-${container.id}`]}
                    title={isProtectedContainer ? 'Machina core container actions are locked' : undefined}
                  >
                    <Square className="mr-2 h-4 w-4" />
                    {loadingActions[`stop-${container.id}`] ? 'Stopping...' : 'Stop'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem 
                  onClick={handleRestart}
                  disabled={isProtectedContainer || loadingActions[`restart-${container.id}`]}
                  title={isProtectedContainer ? 'Machina core container actions are locked' : undefined}
                >
                  <RotateCw className="mr-2 h-4 w-4" />
                  {loadingActions[`restart-${container.id}`] ? 'Restarting...' : 'Restart'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => !isProtectedContainer && setDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                  disabled={isProtectedContainer}
                  title={isProtectedContainer ? 'Machina core container cannot be removed' : undefined}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Status and Type Badges */}
          <div className="flex items-center flex-wrap gap-2">
            <Badge className={getStatusColor()}>{container.status}</Badge>
            {isAmnesic && (
              <Badge variant="outline" className="border-yellow-600 text-yellow-600">
                Amnesic
              </Badge>
            )}
            {isProtectedContainer && (
              <Badge variant="outline" className="border-primary/60 text-primary">
                System
              </Badge>
            )}
          </div>

          {/* Uptime */}
          {container.uptime && (
            <div className="text-xs text-muted-foreground">{container.uptime}</div>
          )}

          {/* Image / Identity */}
          <div className="rounded-lg border border-border/40 bg-muted/20 p-2 text-[11px] text-muted-foreground flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-foreground/80">{container.image}</span>
            <span className="px-2 py-0.5 rounded-full border border-dashed border-border/50">
              ID: {container.id.slice(0, 12)}
            </span>
          </div>

          {/* Ports */}
          {container.ports.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">Ports:</p>
              <div className="flex flex-wrap gap-1">
                {container.ports.slice(0, 3).map((port, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {port.host > 0 ? `${port.host}:${port.container}` : port.container}
                  </Badge>
                ))}
                {container.ports.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{container.ports.length - 3}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CPU</span>
                <div className="flex items-center gap-2">
                  <span className={cn('font-medium', !hasCpuData && 'text-muted-foreground/70')}>
                    {hasCpuData ? `${cpuValue.toFixed(1)}%` : isRunning ? 'Collecting…' : 'Offline'}
                  </span>
                  {hasCpuData && cpuValue >= 95 && (
                    <Badge variant="destructive" className="h-4 text-[10px] px-1">
                      Critical
                    </Badge>
                  )}
                  {hasCpuData && cpuValue >= 80 && cpuValue < 95 && (
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
                    !hasCpuData && 'bg-muted-foreground/30',
                    hasCpuData && cpuValue >= 95 && 'bg-red-500',
                    hasCpuData && cpuValue >= 80 && cpuValue < 95 && 'bg-yellow-500',
                    hasCpuData && cpuValue < 80 && 'bg-blue-500'
                  )}
                  style={{ width: hasCpuData ? `${Math.min(cpuValue, 100)}%` : '0%' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Memory</span>
                <div className="flex items-center gap-2">
                  <span className={cn('font-medium', !hasMemoryData && 'text-muted-foreground/70')}>
                    {hasMemoryData ? `${memoryPct.toFixed(1)}%` : isRunning ? 'Collecting…' : 'Offline'}
                  </span>
                  {hasMemoryData && memoryPct >= 95 && (
                    <Badge variant="destructive" className="h-4 text-[10px] px-1">
                      Critical
                    </Badge>
                  )}
                  {hasMemoryData && memoryPct >= 80 && memoryPct < 95 && (
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
                    !hasMemoryData && 'bg-muted-foreground/30',
                    hasMemoryData && memoryPct >= 95 && 'bg-red-500',
                    hasMemoryData && memoryPct >= 80 && memoryPct < 95 && 'bg-yellow-500',
                    hasMemoryData && memoryPct < 80 && 'bg-blue-500'
                  )}
                  style={{ width: hasMemoryData ? `${Math.min(memoryPct, 100)}%` : '0%' }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>Network</span>
                  <span className="font-medium text-foreground/80">
                    {hasNetworkData && liveStats?.network
                      ? `↓ ${formatBytes(liveStats.network.rx)} / ↑ ${formatBytes(liveStats.network.tx)}`
                      : isRunning ? 'Collecting…' : '—'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      hasNetworkData ? 'bg-green-500' : 'bg-muted-foreground/30'
                    )}
                    style={{ width: hasNetworkData ? '100%' : '0%' }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>Disk</span>
                  <span className="font-medium text-foreground/80">
                    {hasDiskData && liveStats?.blockIO
                      ? `R ${formatBytes(liveStats.blockIO.read)} / W ${formatBytes(liveStats.blockIO.write)}`
                      : isRunning ? 'Collecting…' : '—'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      hasDiskData ? 'bg-purple-500' : 'bg-muted-foreground/30'
                    )}
                    style={{ width: hasDiskData ? '100%' : '0%' }}
                  />
                </div>
              </div>
            </div>
          </div>
          {isAmnesic && (
            <div className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
              ⚠️ Will be deleted when stopped
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2">
            {!isRunning ? (
              <Button
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStart();
                }}
              >
                <Play className="mr-1 h-3 w-3" />
                Start
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStop();
                }}
                disabled={isProtectedContainer || loadingActions[`stop-${container.id}`]}
                title={isProtectedContainer ? 'Machina core container actions are locked' : undefined}
              >
                Stop
              </Button>
            )}
            {isRunning && onTerminal && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  onTerminal(container);
                }}
              >
                <Terminal className="mr-1 h-3 w-3" />
                Terminal
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Container?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete container &quot;{container.name}&quot;?
              {isRunning && ' The container is currently running and will be force stopped.'}
              {!isAmnesic && ' This action cannot be undone.'}
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
