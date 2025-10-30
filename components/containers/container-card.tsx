'use client';

import { Container } from '@/types/container';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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

interface ContainerCardProps {
  container: Container;
  onTerminal?: (container: Container) => void;
  onLogs?: (container: Container) => void;
  liveStats?: ContainerStats; // Real-time stats from live feed
}

export function ContainerCard({ container, onTerminal, onLogs, liveStats }: ContainerCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { startContainer, stopContainer, restartContainer, deleteContainer } = useContainers();

  const isRunning = container.status === 'running';
  const isAmnesic = container.type === 'amnesic';

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

  const handleStart = async () => {
    try {
      await startContainer(container.id);
      toast.success(`Container "${container.name}" started`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start container');
    }
  };

  const handleStop = async () => {
    try {
      await stopContainer(container.id);
      toast.success(`Container "${container.name}" stopped`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to stop container');
    }
  };

  const handleRestart = async () => {
    try {
      await restartContainer(container.id);
      toast.success(`Container "${container.name}" restarted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to restart container');
    }
  };

  const handleDelete = async () => {
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
      <Card className="group relative overflow-hidden transition-all hover:shadow-lg hover:border-primary/50">
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
              <DropdownMenuTrigger asChild>
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
                  <DropdownMenuItem onClick={handleStart}>
                    <Play className="mr-2 h-4 w-4" />
                    Start
                  </DropdownMenuItem>
                )}
                {isRunning && (
                  <DropdownMenuItem onClick={handleStop}>
                    <Square className="mr-2 h-4 w-4" />
                    Stop
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleRestart}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Restart
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
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
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor()}>{container.status}</Badge>
            {isAmnesic && (
              <Badge variant="outline" className="border-yellow-600 text-yellow-600">
                Amnesic
              </Badge>
            )}
          </div>

          {/* Uptime */}
          {container.uptime && (
            <div className="text-xs text-muted-foreground">{container.uptime}</div>
          )}

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

          {/* Resource Usage - Enhanced with real-time stats */}
          {isRunning && (
            <div className="space-y-3 pt-3 border-t">
              {/* CPU Usage */}
              {(liveStats?.cpu !== undefined || container.cpu !== undefined) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">CPU</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {(liveStats?.cpu ?? container.cpu ?? 0).toFixed(1)}%
                      </span>
                      {(liveStats?.cpu ?? container.cpu ?? 0) >= 95 && (
                        <Badge variant="destructive" className="h-4 text-[10px] px-1">
                          Critical
                        </Badge>
                      )}
                      {(liveStats?.cpu ?? container.cpu ?? 0) >= 80 && 
                       (liveStats?.cpu ?? container.cpu ?? 0) < 95 && (
                        <Badge variant="warning" className="h-4 text-[10px] px-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          High
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={liveStats?.cpu ?? container.cpu ?? 0}
                    className={cn(
                      "h-2 transition-all duration-500",
                      (liveStats?.cpu ?? container.cpu ?? 0) >= 95 && "bg-red-950/20",
                      (liveStats?.cpu ?? container.cpu ?? 0) >= 80 &&
                        (liveStats?.cpu ?? container.cpu ?? 0) < 95 && "bg-yellow-950/20"
                    )}
                    indicatorClassName={cn(
                      "transition-all duration-500",
                      (liveStats?.cpu ?? container.cpu ?? 0) >= 95 && "bg-red-500",
                      (liveStats?.cpu ?? container.cpu ?? 0) >= 80 &&
                        (liveStats?.cpu ?? container.cpu ?? 0) < 95 && "bg-yellow-500",
                      (liveStats?.cpu ?? container.cpu ?? 0) < 80 && "bg-blue-500"
                    )}
                  />
                </div>
              )}

              {/* Memory Usage */}
              {(liveStats?.memory !== undefined || container.memory !== undefined) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Memory</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {(liveStats?.memory ?? container.memory ?? 0).toFixed(1)}%
                      </span>
                      {(liveStats?.memory ?? container.memory ?? 0) >= 95 && (
                        <Badge variant="destructive" className="h-4 text-[10px] px-1">
                          Critical
                        </Badge>
                      )}
                      {(liveStats?.memory ?? container.memory ?? 0) >= 80 && 
                       (liveStats?.memory ?? container.memory ?? 0) < 95 && (
                        <Badge variant="warning" className="h-4 text-[10px] px-1 bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                          High
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={liveStats?.memory ?? container.memory ?? 0}
                    className={cn(
                      "h-2 transition-all duration-500",
                      (liveStats?.memory ?? container.memory ?? 0) >= 95 && "bg-red-950/20",
                      (liveStats?.memory ?? container.memory ?? 0) >= 80 &&
                        (liveStats?.memory ?? container.memory ?? 0) < 95 && "bg-yellow-950/20"
                    )}
                    indicatorClassName={cn(
                      "transition-all duration-500",
                      (liveStats?.memory ?? container.memory ?? 0) >= 95 && "bg-red-500",
                      (liveStats?.memory ?? container.memory ?? 0) >= 80 &&
                        (liveStats?.memory ?? container.memory ?? 0) < 95 && "bg-yellow-500",
                      (liveStats?.memory ?? container.memory ?? 0) < 80 && "bg-blue-500"
                    )}
                  />
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

              {/* Disk I/O */}
              {liveStats?.blockRead !== undefined && liveStats?.blockWrite !== undefined && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Disk I/O</span>
                    <span className="font-medium text-[10px]">
                      R {formatBytes(liveStats.blockRead)} / W {formatBytes(liveStats.blockWrite)}
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
            </div>
          )}

          {/* Warning for amnesic containers */}
          {isAmnesic && (
            <div className="text-xs text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 p-2 rounded">
              ⚠️ Will be deleted when stopped
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 pt-2">
            {!isRunning ? (
              <Button size="sm" className="flex-1" onClick={handleStart}>
                <Play className="mr-1 h-3 w-3" />
                Start
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="flex-1" onClick={handleStop}>
                <Square className="mr-1 h-3 w-3" />
                Stop
              </Button>
            )}
            {isRunning && onTerminal && (
              <Button size="sm" variant="outline" onClick={() => onTerminal(container)}>
                <Terminal className="h-3 w-3" />
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
