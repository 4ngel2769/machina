'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Plus, Trash2, Database, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/vm-helpers';

interface StoragePoolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoragePoolsDialog({ open, onOpenChange }: StoragePoolsDialogProps) {
  const { storagePools, poolsLoading, fetchStoragePools, createStoragePool, deleteStoragePool } = useVMs();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletePoolName, setDeletePoolName] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'dir',
    path: '',
  });

  useEffect(() => {
    if (open) {
      fetchStoragePools();
    }
  }, [open, fetchStoragePools]);

  const handleCreate = async () => {
    if (!formData.name || !formData.path) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createStoragePool(formData);
      toast.success(`Storage pool "${formData.name}" created successfully`);
      setFormData({ name: '', type: 'dir', path: '' });
      setShowCreateForm(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create storage pool');
    }
  };

  const handleDelete = async () => {
    if (!deletePoolName) return;

    try {
      await deleteStoragePool(deletePoolName);
      toast.success(`Storage pool "${deletePoolName}" deleted`);
      setDeletePoolName(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete storage pool');
    }
  };

  const getUsagePercentage = (allocation: number, capacity: number) => {
    if (capacity === 0) return 0;
    return (allocation / capacity) * 100;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Storage Pools
            </DialogTitle>
            <DialogDescription>
              Manage libvirt storage pools for VM disk images
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create Form */}
            {showCreateForm ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Create Storage Pool</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pool-name">Pool Name</Label>
                    <Input
                      id="pool-name"
                      placeholder="my-pool"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pool-type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger id="pool-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dir">Directory</SelectItem>
                        <SelectItem value="disk">Physical Disk</SelectItem>
                        <SelectItem value="logical">Logical Volume</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pool-path">Path</Label>
                    <Input
                      id="pool-path"
                      placeholder="/var/lib/libvirt/images/my-pool"
                      value={formData.path}
                      onChange={(e) => setFormData({ ...formData, path: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreateForm(false);
                        setFormData({ name: '', type: 'dir', path: '' });
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreate}>Create Pool</Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button onClick={() => setShowCreateForm(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Storage Pool
              </Button>
            )}

            {/* Pools List */}
            {poolsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading storage pools...
              </div>
            ) : storagePools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No storage pools found
              </div>
            ) : (
              <div className="space-y-3">
                {storagePools.map((pool) => (
                  <Card key={pool.name}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-base flex items-center gap-2">
                            <HardDrive className="h-4 w-4" />
                            {pool.name}
                            <Badge variant={pool.state === 'active' ? 'default' : 'secondary'}>
                              {pool.state}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {pool.type} • {pool.path}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletePoolName(pool.name)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Storage</span>
                          <span className="font-medium">
                            {formatBytes(pool.allocation)} / {formatBytes(pool.capacity)}
                          </span>
                        </div>
                        <Progress value={getUsagePercentage(pool.allocation, pool.capacity)} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Available: {formatBytes(pool.available)}</span>
                          <span>{getUsagePercentage(pool.allocation, pool.capacity).toFixed(1)}% used</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePoolName} onOpenChange={() => setDeletePoolName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Storage Pool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the storage pool <strong>{deletePoolName}</strong>?
              This will not delete the actual directory or files.
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
