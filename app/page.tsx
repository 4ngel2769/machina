'use client';

import { useContainers } from '@/hooks/use-containers';
import { useVMs } from '@/hooks/use-vms';

export default function DashboardPage() {
  const { containers, loading: containersLoading } = useContainers();
  const { vms, isLoading: vmsLoading } = useVMs();

  const runningContainers = containers.filter(c => c.status === 'running');
  const runningVMs = vms.filter(vm => vm.status === 'running');

  const isLoading = containersLoading || vmsLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your system resources and running services
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="text-2xl font-bold">{containers.length}</div>
            <div className="text-sm text-muted-foreground">Total Containers</div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-2xl font-bold">{runningContainers.length}</div>
            <div className="text-sm text-muted-foreground">Running Containers</div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-2xl font-bold">{vms.length}</div>
            <div className="text-sm text-muted-foreground">Total VMs</div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="text-2xl font-bold">{runningVMs.length}</div>
            <div className="text-sm text-muted-foreground">Running VMs</div>
          </div>
        </div>
      )}
    </div>
  );
}
