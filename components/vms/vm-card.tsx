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

interface VMCardProps {
  vm: VirtualMachine;
}

export function VMCard({ vm }: VMCardProps) {
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

          {/* Resource Usage (if available) */}
          {(vm.cpu_usage !== undefined || vm.memory_usage !== undefined) && (
            <div className="space-y-2">
              {vm.cpu_usage !== undefined && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-medium">{vm.cpu_usage.toFixed(1)}%</span>
                  </div>
                  <Progress value={vm.cpu_usage} className="h-1.5" />
                </div>
              )}
              
              {vm.memory_usage !== undefined && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium">{vm.memory_usage.toFixed(1)}%</span>
                  </div>
                  <Progress value={vm.memory_usage} className="h-1.5" />
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
