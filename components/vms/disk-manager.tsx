'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Loader2, HardDrive, Expand, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DiskInfo {
  path: string;
  size: string;
  format: string;
  target: string;
}

interface DiskManagerProps {
  vmName: string;
  vmStatus: string;
}

export function DiskManager({ vmName, vmStatus }: DiskManagerProps) {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [selectedDisk, setSelectedDisk] = useState('');
  const [newSize, setNewSize] = useState('');
  const [sizeUnit, setSizeUnit] = useState('G');
  const [isLoading, setIsLoading] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const fetchDisks = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/disks`);
      if (!response.ok) throw new Error('Failed to fetch disks');
      const data = await response.json();
      setDisks(data.disks || []);
      if (data.disks && data.disks.length > 0) {
        setSelectedDisk(data.disks[0].path);
      }
    } catch (error) {
      toast.error('Failed to load disk information');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDisks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmName]);

  const handleResize = async () => {
    if (!selectedDisk || !newSize) {
      toast.error('Please select a disk and enter a new size');
      return;
    }

    const sizeValue = parseInt(newSize);
    if (isNaN(sizeValue) || sizeValue <= 0) {
      toast.error('Please enter a valid size');
      return;
    }

    setIsResizing(true);
    try {
      const response = await fetch(`/api/vms/${vmName}/disks/resize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diskPath: selectedDisk,
          newSize: `${sizeValue}${sizeUnit}`,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to resize disk');
      }

      const result = await response.json();
      toast.success(result.message);
      if (result.note) {
        toast.info(result.note, { duration: 5000 });
      }
      
      setNewSize('');
      await fetchDisks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resize disk');
    } finally {
      setIsResizing(false);
      setShowConfirmDialog(false);
    }
  };

  const isVMRunning = vmStatus === 'running';

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Disk Management
          </CardTitle>
          <CardDescription>
            Resize virtual disks (grow only, shrinking not supported)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Warning for running VM */}
              {isVMRunning && (
                <div className="flex items-start gap-3 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">VM Must Be Stopped</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Stop the virtual machine before resizing disks
                    </p>
                  </div>
                </div>
              )}

              {/* Disk Selection */}
              <div className="space-y-2">
                <Label htmlFor="disk-select">Select Disk</Label>
                <Select value={selectedDisk} onValueChange={setSelectedDisk} disabled={isVMRunning}>
                  <SelectTrigger id="disk-select">
                    <SelectValue placeholder="Select a disk" />
                  </SelectTrigger>
                  <SelectContent>
                    {disks.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No disks found
                      </SelectItem>
                    ) : (
                      disks.map((disk) => (
                        <SelectItem key={disk.path} value={disk.path}>
                          {disk.target} - {disk.size} ({disk.format})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Current Disk Info */}
              {selectedDisk && disks.length > 0 && (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="font-medium mb-1">Current Disk Information</div>
                  {disks
                    .filter((d) => d.path === selectedDisk)
                    .map((disk) => (
                      <div key={disk.path} className="space-y-1 text-muted-foreground">
                        <div>Path: {disk.path}</div>
                        <div>Size: {disk.size}</div>
                        <div>Format: {disk.format}</div>
                      </div>
                    ))}
                </div>
              )}

              {/* New Size Input */}
              <div className="space-y-2">
                <Label htmlFor="new-size">New Size</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-size"
                    type="number"
                    placeholder="e.g., 50"
                    value={newSize}
                    onChange={(e) => setNewSize(e.target.value)}
                    disabled={isVMRunning}
                    min="1"
                  />
                  <Select value={sizeUnit} onValueChange={setSizeUnit} disabled={isVMRunning}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">MB</SelectItem>
                      <SelectItem value="G">GB</SelectItem>
                      <SelectItem value="T">TB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ Only growing disk size is supported. You cannot shrink a disk.
                </p>
              </div>

              {/* Resize Button */}
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={isVMRunning || isResizing || !selectedDisk || !newSize}
                className="w-full"
              >
                {isResizing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resizing...
                  </>
                ) : (
                  <>
                    <Expand className="h-4 w-4 mr-2" />
                    Resize Disk
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Disk Resize</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to resize this disk to <strong>{newSize}{sizeUnit}</strong>?
              <br />
              <br />
              <strong>Important:</strong> After resizing, you&apos;ll need to resize the filesystem
              inside the VM to use the additional space.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResize}>Resize Disk</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
