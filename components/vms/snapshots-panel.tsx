'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Loader2, Camera, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Snapshot {
  name: string;
  state: string;
  creationTime: string;
  isCurrent: boolean;
}

interface SnapshotsPanelProps {
  vmName: string;
}

export function SnapshotsPanel({ vmName }: SnapshotsPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteSnapshot, setDeleteSnapshot] = useState<string | null>(null);
  const [revertSnapshot, setRevertSnapshot] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/snapshots`);
      if (!response.ok) throw new Error('Failed to fetch snapshots');
      const data = await response.json();
      setSnapshots(data.snapshots || []);
    } catch (error) {
      toast.error('Failed to load snapshots');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmName]);

  const handleCreateSnapshot = async () => {
    if (!newSnapshotName) {
      toast.error('Please enter a snapshot name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSnapshotName }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create snapshot');
      }

      toast.success(`Snapshot "${newSnapshotName}" created successfully`);
      setNewSnapshotName('');
      await fetchSnapshots();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create snapshot');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevertSnapshot = async (snapshotName: string) => {
    try {
      const response = await fetch(`/api/vms/${vmName}/snapshots/${snapshotName}/revert`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revert to snapshot');
      }

      toast.success(`Reverted to snapshot "${snapshotName}"`);
      await fetchSnapshots();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revert snapshot');
    } finally {
      setRevertSnapshot(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotName: string) => {
    try {
      const response = await fetch(`/api/vms/${vmName}/snapshots/${snapshotName}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete snapshot');
      }

      toast.success(`Snapshot "${snapshotName}" deleted`);
      await fetchSnapshots();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete snapshot');
    } finally {
      setDeleteSnapshot(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Snapshots</CardTitle>
          <CardDescription>
            Create and manage VM snapshots for easy rollback
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create Snapshot Form */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="snapshot-name" className="sr-only">
                Snapshot Name
              </Label>
              <Input
                id="snapshot-name"
                placeholder="Snapshot name (e.g., before-update)"
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSnapshot()}
              />
            </div>
            <Button onClick={handleCreateSnapshot} disabled={isCreating || !newSnapshotName}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </div>

          {/* Snapshots List */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No snapshots created yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snapshot) => (
                  <TableRow key={snapshot.name}>
                    <TableCell className="font-medium">
                      {snapshot.name}
                      {snapshot.isCurrent && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                          (current)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{snapshot.state}</TableCell>
                    <TableCell>{new Date(snapshot.creationTime).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRevertSnapshot(snapshot.name)}
                        disabled={snapshot.isCurrent}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Revert
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteSnapshot(snapshot.name)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteSnapshot} onOpenChange={() => setDeleteSnapshot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete snapshot <strong>{deleteSnapshot}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSnapshot && handleDeleteSnapshot(deleteSnapshot)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revert Confirmation Dialog */}
      <AlertDialog open={!!revertSnapshot} onOpenChange={() => setRevertSnapshot(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert to Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revert to snapshot <strong>{revertSnapshot}</strong>?
              Any changes made after this snapshot will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revertSnapshot && handleRevertSnapshot(revertSnapshot)}
            >
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
