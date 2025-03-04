'use client';

import { useStats } from '@/hooks/use-stats';
import { useContainers } from '@/hooks/use-containers';
import { useVMs } from '@/hooks/use-vms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Cpu, MemoryStick, HardDrive, Network, Box, Monitor } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function DashboardPage() {
  const { stats, loading: statsLoading } = useStats();
  const { containers, loading: containersLoading } = useContainers();
  const { vms, loading: vmsLoading } = useVMs();

  const runningContainers = containers.filter(c => c.status === 'running');
  const runningVMs = vms.filter(vm => vm.status === 'running');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your system resources and running services
        </p>
      </div>
    </div>
  );
}
