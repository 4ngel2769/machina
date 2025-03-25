'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Server, 
  HardDrive, 
  Cpu, 
  MemoryStick,
  Edit,
  Ban,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { UserQuota, getQuotaUsagePercentage } from '@/lib/quota-system';
import { PageLoading } from '@/components/loading-skeletons';
import { HelpTooltip } from '@/components/help-tooltips';

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [quotas, setQuotas] = useState<UserQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuota, setEditingQuota] = useState<UserQuota | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editForm, setEditForm] = useState({
    maxVCpus: 8,
    maxMemoryMB: 16384,
    maxDiskGB: 100,
    maxVMs: 5,
    maxContainers: 10,
  });

  // Redirect if not admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.role !== 'admin') {
      router.push('/');
      toast({
        title: 'Access Denied',
        description: 'Only administrators can access this page.',
        variant: 'destructive',
      });
    }
  }, [session, status, router, toast]);

  // Fetch quotas
  const fetchQuotas = async () => {
    try {
      const response = await fetch('/api/admin/quotas');
      if (!response.ok) throw new Error('Failed to fetch quotas');
      const data = await response.json();
      setQuotas(data);
    } catch (error) {
      console.error('Error fetching quotas:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user quotas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchQuotas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Handle edit quota
  const handleEditQuota = (quota: UserQuota) => {
    setEditingQuota(quota);
    setEditForm(quota.quotas);
    setShowEditDialog(true);
  };

  const handleSaveQuota = async () => {
    if (!editingQuota) return;
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/quotas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingQuota.userId,
          username: editingQuota.username,
          quotas: editForm,
        }),
      });

      if (!response.ok) throw new Error('Failed to update quota');

      toast({
        title: 'Success',
        description: `Quotas updated for ${editingQuota.username}`,
      });

      setShowEditDialog(false);
      fetchQuotas();
    } catch (error) {
      console.error('Error updating quota:', error);
      toast({
        title: 'Error',
        description: 'Failed to update quotas',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle suspend/unsuspend user
  const handleToggleSuspend = async (userId: string, username: string, currentlySuspended: boolean) => {
    try {
      const response = await fetch('/api/admin/quotas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          suspended: !currentlySuspended,
        }),
      });

      if (!response.ok) throw new Error('Failed to update suspension status');

      toast({
        title: 'Success',
        description: `${username} has been ${currentlySuspended ? 'unsuspended' : 'suspended'}`,
      });

      fetchQuotas();
    } catch (error) {
      console.error('Error toggling suspension:', error);
      toast({
        title: 'Error',
        description: 'Failed to update suspension status',
        variant: 'destructive',
      });
    }
  };

  // Calculate totals
  const totalStats = quotas.reduce(
    (acc, quota) => ({
      totalUsers: acc.totalUsers + 1,
      totalVMs: acc.totalVMs + quota.usage.currentVMs,
      totalContainers: acc.totalContainers + quota.usage.currentContainers,
      totalVCpus: acc.totalVCpus + quota.usage.currentVCpus,
      totalMemoryMB: acc.totalMemoryMB + quota.usage.currentMemoryMB,
      totalDiskGB: acc.totalDiskGB + quota.usage.currentDiskGB,
    }),
    { totalUsers: 0, totalVMs: 0, totalContainers: 0, totalVCpus: 0, totalMemoryMB: 0, totalDiskGB: 0 }
  );

  if (status === 'loading' || loading) {
    return <PageLoading message="Loading admin dashboard..." />;
  }

  if (session?.user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">Manage user resources and quotas</p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalUsers}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total VMs</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalVMs}</div>
            <p className="text-xs text-muted-foreground">Running virtual machines</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Containers</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalContainers}</div>
            <p className="text-xs text-muted-foreground">Running containers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total vCPUs</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalVCpus}</div>
            <p className="text-xs text-muted-foreground">Allocated CPU cores</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Memory</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalStats.totalMemoryMB / 1024).toFixed(1)} GB
            </div>
            <p className="text-xs text-muted-foreground">Allocated RAM</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Disk</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalDiskGB} GB</div>
            <p className="text-xs text-muted-foreground">Allocated storage</p>
          </CardContent>
        </Card>
      </div>

      {/* User Quotas Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Resource Quotas</CardTitle>
              <CardDescription>Manage resource limits for each user</CardDescription>
            </div>
            <HelpTooltip content="Set CPU, RAM, disk, and resource count limits for each user. Users cannot exceed their quotas." />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>VMs</TableHead>
                <TableHead>Containers</TableHead>
                <TableHead>vCPUs</TableHead>
                <TableHead>Memory</TableHead>
                <TableHead>Disk</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No users with quotas yet
                  </TableCell>
                </TableRow>
              ) : (
                quotas.map((quota) => {
                  const vmUsage = getQuotaUsagePercentage(quota.usage.currentVMs, quota.quotas.maxVMs);
                  const containerUsage = getQuotaUsagePercentage(
                    quota.usage.currentContainers,
                    quota.quotas.maxContainers
                  );
                  const cpuUsage = getQuotaUsagePercentage(
                    quota.usage.currentVCpus,
                    quota.quotas.maxVCpus
                  );
                  const memUsage = getQuotaUsagePercentage(
                    quota.usage.currentMemoryMB,
                    quota.quotas.maxMemoryMB
                  );
                  const diskUsage = getQuotaUsagePercentage(
                    quota.usage.currentDiskGB,
                    quota.quotas.maxDiskGB
                  );

                  return (
                    <TableRow key={quota.userId}>
                      <TableCell className="font-medium">{quota.username}</TableCell>
                      <TableCell>
                        {quota.suspended ? (
                          <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                            <Ban className="h-3 w-3" />
                            Suspended
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {quota.usage.currentVMs}/{quota.quotas.maxVMs}
                          </div>
                          <Progress value={vmUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {quota.usage.currentContainers}/{quota.quotas.maxContainers}
                          </div>
                          <Progress value={containerUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {quota.usage.currentVCpus}/{quota.quotas.maxVCpus}
                          </div>
                          <Progress value={cpuUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {quota.usage.currentMemoryMB}MB/{quota.quotas.maxMemoryMB}MB
                          </div>
                          <Progress value={memUsage} className="h-1" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {quota.usage.currentDiskGB}GB/{quota.quotas.maxDiskGB}GB
                          </div>
                          <Progress value={diskUsage} className="h-1" />
                          {diskUsage >= 80 && (
                            <div className="flex items-center gap-1 text-xs text-amber-500">
                              <AlertTriangle className="h-3 w-3" />
                              Near limit
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditQuota(quota)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleToggleSuspend(quota.userId, quota.username, quota.suspended)
                            }
                          >
                            {quota.suspended ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Quota Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Resource Quotas</DialogTitle>
            <DialogDescription>
              Set resource limits for {editingQuota?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max VMs</Label>
                <Input
                  type="number"
                  value={editForm.maxVMs}
                  onChange={(e) => setEditForm({ ...editForm, maxVMs: parseInt(e.target.value) || 0 })}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Containers</Label>
                <Input
                  type="number"
                  value={editForm.maxContainers}
                  onChange={(e) =>
                    setEditForm({ ...editForm, maxContainers: parseInt(e.target.value) || 0 })
                  }
                  min="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max vCPUs</Label>
              <Input
                type="number"
                value={editForm.maxVCpus}
                onChange={(e) => setEditForm({ ...editForm, maxVCpus: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Max Memory (MB)</Label>
              <Input
                type="number"
                value={editForm.maxMemoryMB}
                onChange={(e) =>
                  setEditForm({ ...editForm, maxMemoryMB: parseInt(e.target.value) || 0 })
                }
                min="0"
              />
              <p className="text-xs text-muted-foreground">
                {(editForm.maxMemoryMB / 1024).toFixed(1)} GB
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max Disk (GB)</Label>
              <Input
                type="number"
                value={editForm.maxDiskGB}
                onChange={(e) =>
                  setEditForm({ ...editForm, maxDiskGB: parseInt(e.target.value) || 0 })
                }
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveQuota} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
