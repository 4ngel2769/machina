'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Download, Upload, Trash2, Loader2, Database, HardDrive, Settings as SettingsIcon, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Backup {
  filename: string;
  type: 'container' | 'vm' | 'settings' | 'unknown';
  timestamp: string;
}

export default function BackupPage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<Backup | null>(null);
  const [newName, setNewName] = useState('');

  // Backup creation state
  const [backupType, setBackupType] = useState<'container' | 'vm' | 'settings' | 'full'>('full');
  const [resourceId, setResourceId] = useState('');

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/backup');
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups);
      } else {
        toast.error('Failed to load backups');
      }
    } catch {
      toast.error('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    if ((backupType === 'container' || backupType === 'vm') && !resourceId) {
      toast.error('Please enter a resource ID');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: backupType, resourceId }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(`Backup created successfully`);
        if (data.backup?.note) {
          toast.info(data.backup.note);
        }
        fetchBackups();
        setResourceId('');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create backup');
      }
    } catch {
      toast.error('Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    try {
      const response = await fetch(`/api/backup?filename=${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Backup deleted');
        fetchBackups();
      } else {
        toast.error('Failed to delete backup');
      }
    } catch {
      toast.error('Failed to delete backup');
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) return;

    try {
      const response = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filename: selectedBackup.filename,
          newName: newName || undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        if (data.note) {
          toast.info(data.note);
        }
        setRestoreDialogOpen(false);
        setSelectedBackup(null);
        setNewName('');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to restore backup');
      }
    } catch {
      toast.error('Failed to restore backup');
    }
  };

  const getBackupIcon = (type: string) => {
    switch (type) {
      case 'container': return <Database className="h-4 w-4" />;
      case 'vm': return <HardDrive className="h-4 w-4" />;
      case 'settings': return <SettingsIcon className="h-4 w-4" />;
      default: return <Archive className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp.replace(/-/g, ':')).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Backup & Restore</h1>
        <p className="text-muted-foreground">
          Create and manage backups of your containers, VMs, and settings
        </p>
      </div>

      {/* Create Backup */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Backup</CardTitle>
          <CardDescription>
            Backup containers, VMs, settings, or everything at once
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Backup Type</Label>
              <Select value={backupType} onValueChange={(v) => setBackupType(v as typeof backupType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Backup (All Resources)</SelectItem>
                  <SelectItem value="container">Single Container</SelectItem>
                  <SelectItem value="vm">Single VM</SelectItem>
                  <SelectItem value="settings">Settings Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(backupType === 'container' || backupType === 'vm') && (
              <div className="space-y-2">
                <Label>{backupType === 'container' ? 'Container Name' : 'VM Name'}</Label>
                <Input
                  placeholder={`Enter ${backupType} name`}
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                />
              </div>
            )}
          </div>

          <Button onClick={createBackup} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Backup...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Create Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Backup List */}
      <Card>
        <CardHeader>
          <CardTitle>Available Backups</CardTitle>
          <CardDescription>
            {backups.length} backup(s) found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading backups...</p>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No backups found</p>
              <p className="text-sm mt-2">Create your first backup above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="p-2 rounded-lg bg-muted">
                      {getBackupIcon(backup.type)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{backup.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(backup.timestamp)}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {backup.type}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedBackup(backup);
                        setRestoreDialogOpen(true);
                      }}
                    >
                      <Upload className="mr-2 h-3 w-3" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteBackup(backup.filename)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              Restore from: {selectedBackup?.filename}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Name (optional)</Label>
              <Input
                placeholder="Leave empty to use original name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Specify a different name to avoid conflicts with existing resources
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={restoreBackup}>
              <Upload className="mr-2 h-4 w-4" />
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
