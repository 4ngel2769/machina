'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useVMs } from '@/hooks/use-vms';

interface CloneVMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceVMName: string;
}

export function CloneVMDialog({ open, onOpenChange, sourceVMName }: CloneVMDialogProps) {
  const { storagePools, networks, fetchStoragePools, fetchNetworks, fetchVMs } = useVMs();
  const [newVMName, setNewVMName] = useState(`${sourceVMName}-clone`);
  const [cloneDisks, setCloneDisks] = useState(true);
  const [selectedPool, setSelectedPool] = useState('default');
  const [selectedNetwork, setSelectedNetwork] = useState('default');
  const [isCloning, setIsCloning] = useState(false);

  // Fetch pools and networks when dialog opens
  useState(() => {
    if (open) {
      fetchStoragePools();
      fetchNetworks();
    }
  });

  const handleClone = async () => {
    if (!newVMName) {
      toast.error('Please enter a name for the cloned VM');
      return;
    }

    setIsCloning(true);

    try {
      const response = await fetch(`/api/vms/${sourceVMName}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newName: newVMName,
          cloneDisks,
          storagePool: selectedPool,
          network: selectedNetwork,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to clone VM');
      }

      toast.success(`VM cloned successfully as ${newVMName}`);
      await fetchVMs();
      onOpenChange(false);
      
      // Reset form
      setNewVMName(`${sourceVMName}-clone`);
      setCloneDisks(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clone VM');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Clone Virtual Machine</DialogTitle>
          <DialogDescription>
            Create a copy of <strong>{sourceVMName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* New VM Name */}
          <div className="space-y-2">
            <Label htmlFor="clone-name">New VM Name</Label>
            <Input
              id="clone-name"
              value={newVMName}
              onChange={(e) => setNewVMName(e.target.value)}
              placeholder="my-cloned-vm"
            />
          </div>

          {/* Clone Disks Option */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="clone-disks"
              checked={cloneDisks}
              onCheckedChange={(checked) => setCloneDisks(checked as boolean)}
            />
            <Label
              htmlFor="clone-disks"
              className="text-sm font-normal cursor-pointer"
            >
              Clone disk images (recommended)
            </Label>
          </div>

          {/* Storage Pool */}
          <div className="space-y-2">
            <Label htmlFor="storage-pool">Storage Pool</Label>
            <Select value={selectedPool} onValueChange={setSelectedPool}>
              <SelectTrigger id="storage-pool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storagePools.length === 0 ? (
                  <SelectItem value="default">default</SelectItem>
                ) : (
                  storagePools.map((pool) => (
                    <SelectItem key={pool.name} value={pool.name}>
                      {pool.name} ({pool.type})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Network */}
          <div className="space-y-2">
            <Label htmlFor="network">Virtual Network</Label>
            <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
              <SelectTrigger id="network">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {networks.length === 0 ? (
                  <SelectItem value="default">default</SelectItem>
                ) : (
                  networks.map((net) => (
                    <SelectItem key={net.name} value={net.name}>
                      {net.name} ({net.mode})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCloning}>
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={isCloning}>
            {isCloning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cloning...
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Clone VM
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
