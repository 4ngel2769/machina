'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Loader2, AlertTriangle, Cpu, MemoryStick } from 'lucide-react';
import { toast } from 'sonner';

interface VMDetails {
  name: string;
  status: string;
  memory: number;
  vcpus: number;
}

export default function VMEditPage() {
  const params = useParams();
  const router = useRouter();
  const vmName = params.id as string;
  
  const [vm, setVm] = useState<VMDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Editable fields
  const [memory, setMemory] = useState('');
  const [vcpus, setVcpus] = useState('');

  useEffect(() => {
    const fetchVM = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/vms/${vmName}`);
        if (!res.ok) throw new Error('Failed to fetch VM');
        
        const data = await res.json();
        setVm(data.vm);
        setMemory(data.vm.memory.toString());
        setVcpus(data.vm.vcpus.toString());
      } catch (error) {
        toast.error('Failed to load VM details');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVM();
  }, [vmName]);

  const handleSave = async () => {
    if (!vm) return;

    if (vm.status === 'running') {
      toast.error('Please stop the VM before editing configuration');
      return;
    }

    try {
      setIsSaving(true);
      
      // Update memory
      if (parseInt(memory) !== vm.memory) {
        const memRes = await fetch(`/api/vms/${vmName}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory: parseInt(memory) }),
        });
        if (!memRes.ok) throw new Error('Failed to update memory');
      }

      // Update vCPUs
      if (parseInt(vcpus) !== vm.vcpus) {
        const vcpuRes = await fetch(`/api/vms/${vmName}/config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vcpus: parseInt(vcpus) }),
        });
        if (!vcpuRes.ok) throw new Error('Failed to update vCPUs');
      }

      toast.success('VM configuration updated successfully');
      router.push(`/vms/${vmName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update VM');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!vm) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <p>VM not found</p>
      </div>
    );
  }

  const isRunning = vm.status === 'running';

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/vms/${vmName}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Edit VM: {vm.name}</h1>
            <p className="text-muted-foreground">Modify virtual machine configuration</p>
          </div>
        </div>
        <Badge variant={isRunning ? 'default' : 'secondary'}>
          {vm.status}
        </Badge>
      </div>

      {/* Warning if VM is running */}
      {isRunning && (
        <Card className="border-yellow-500 bg-yellow-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
              <AlertTriangle className="h-5 w-5" />
              VM is Running
            </CardTitle>
            <CardDescription>
              Stop the VM to edit its configuration. Changes to memory and vCPUs require the VM to be stopped.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Configuration</CardTitle>
          <CardDescription>
            Modify CPU and memory allocation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Memory */}
          <div className="space-y-2">
            <Label htmlFor="memory" className="flex items-center gap-2">
              <MemoryStick className="h-4 w-4" />
              Memory (MB)
            </Label>
            <Input
              id="memory"
              type="number"
              min="512"
              max="65536"
              step="256"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              disabled={isRunning}
            />
            <p className="text-sm text-muted-foreground">
              Minimum: 512 MB, Maximum: 65536 MB (64 GB)
            </p>
          </div>

          <Separator />

          {/* vCPUs */}
          <div className="space-y-2">
            <Label htmlFor="vcpus" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Virtual CPUs
            </Label>
            <Input
              id="vcpus"
              type="number"
              min="1"
              max="32"
              value={vcpus}
              onChange={(e) => setVcpus(e.target.value)}
              disabled={isRunning}
            />
            <p className="text-sm text-muted-foreground">
              Minimum: 1, Maximum: 32
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/vms/${vmName}`)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isRunning || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
