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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Coins,
  TrendingUp,
  Crown,
} from 'lucide-react';
import { getAvailablePlans, formatTokens, RESOURCE_PLANS } from '@/lib/token-plans';
import { PageLoading } from '@/components/loading-skeletons';
import { HelpTooltip } from '@/components/help-tooltips';

// Define types locally to avoid importing from quota-system
interface UserQuota {
  userId: string;
  username: string;
  quotas: {
    maxVCpus: number;
    maxMemoryMB: number;
    maxDiskGB: number;
    maxVMs: number;
    maxContainers: number;
  };
  usage: {
    currentVCpus: number;
    currentMemoryMB: number;
    currentDiskGB: number;
    currentVMs: number;
    currentContainers: number;
  };
  currentPlan: string;
  tokenBalance: number;
  planActivatedAt: string | null;
  planExpiresAt: string | null;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

// Helper function for quota percentage
function getQuotaUsagePercentage(usage: number, quota: number): number {
  if (quota === 0) return 0;
  return Math.min(Math.round((usage / quota) * 100), 100);
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [quotas, setQuotas] = useState<UserQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuota, setEditingQuota] = useState<UserQuota | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showTokenDialog, setShowTokenDialog] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [editForm, setEditForm] = useState({
    maxVCpus: 8,
    maxMemoryMB: 16384,
    maxDiskGB: 100,
    maxVMs: 5,
    maxContainers: 10,
  });

  const [tokenForm, setTokenForm] = useState({
    amount: 0,
    action: 'add' as 'add' | 'remove' | 'set',
  });

  const [planForm, setPlanForm] = useState({
    planId: 'free',
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

  // Handle manage tokens
  const handleManageTokens = (quota: UserQuota) => {
    setEditingQuota(quota);
    setTokenForm({ amount: 0, action: 'add' });
    setShowTokenDialog(true);
  };

  const handleSaveTokens = async () => {
    if (!editingQuota) return;
    setSubmitting(true);

    try {
      const endpoint = '/api/admin/tokens';
      const method = tokenForm.action === 'add' ? 'POST' : tokenForm.action === 'remove' ? 'DELETE' : 'PUT';
      
      const body = tokenForm.action === 'set' 
        ? { userId: editingQuota.userId, balance: tokenForm.amount }
        : { userId: editingQuota.userId, amount: tokenForm.amount };

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('Failed to update tokens');

      const data = await response.json();
      
      toast({
        title: 'Success',
        description: `Token balance updated: ${data.tokenBalance} tokens`,
      });

      setShowTokenDialog(false);
      fetchQuotas();
    } catch (error) {
      console.error('Error updating tokens:', error);
      toast({
        title: 'Error',
        description: 'Failed to update token balance',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle change plan
  const handleChangePlan = (quota: UserQuota) => {
    setEditingQuota(quota);
    setPlanForm({ planId: quota.currentPlan });
    setShowPlanDialog(true);
  };

  const handleSavePlan = async () => {
    if (!editingQuota) return;
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingQuota.userId,
          planId: planForm.planId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.details?.shortage) {
          toast({
            title: 'Insufficient Tokens',
            description: `User needs ${error.details.shortage} more tokens to activate this plan.`,
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }
        throw new Error('Failed to change plan');
      }

      toast({
        title: 'Success',
        description: `Plan changed to ${planForm.planId}`,
      });

      setShowPlanDialog(false);
      fetchQuotas();
    } catch (error) {
      console.error('Error changing plan:', error);
      toast({
        title: 'Error',
        description: 'Failed to change plan',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage user resources and quotas</p>
        </div>
        <Button onClick={() => router.push('/settings/users')}>
          <Users className="mr-2 h-4 w-4" />
          Manage Users
        </Button>
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
                <TableHead>Plan</TableHead>
                <TableHead>Tokens</TableHead>
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
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
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
                        <Badge 
                          variant={
                            quota.currentPlan === 'admin' ? 'default' :
                            quota.currentPlan === 'enterprise' ? 'secondary' :
                            quota.currentPlan === 'pro' ? 'secondary' :
                            'outline'
                          }
                          className="flex items-center gap-1 w-fit capitalize"
                        >
                          {quota.currentPlan === 'admin' && <Crown className="h-3 w-3" />}
                          {quota.currentPlan === 'enterprise' && <TrendingUp className="h-3 w-3" />}
                          {quota.currentPlan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Coins className="h-4 w-4 text-amber-500" />
                          <span className="font-medium">{formatTokens(quota.tokenBalance)}</span>
                        </div>
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
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditQuota(quota)}
                            title="Edit Quotas"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleManageTokens(quota)}
                            title="Manage Tokens"
                          >
                            <Coins className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleChangePlan(quota)}
                            title="Change Plan"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              handleToggleSuspend(quota.userId, quota.username, quota.suspended)
                            }
                            title={quota.suspended ? 'Unsuspend User' : 'Suspend User'}
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

      {/* Token Management Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Tokens</DialogTitle>
            <DialogDescription>
              Manage token balance for {editingQuota?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">Current Balance</p>
                  <p className="text-2xl font-bold">
                    {editingQuota ? formatTokens(editingQuota.tokenBalance) : '0'}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select 
                value={tokenForm.action} 
                onValueChange={(value: 'add' | 'remove' | 'set') => 
                  setTokenForm({ ...tokenForm, action: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Tokens</SelectItem>
                  <SelectItem value="remove">Remove Tokens</SelectItem>
                  <SelectItem value="set">Set Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                {tokenForm.action === 'set' ? 'New Balance' : 'Amount'}
              </Label>
              <Input
                type="number"
                value={tokenForm.amount}
                onChange={(e) => setTokenForm({ ...tokenForm, amount: parseInt(e.target.value) || 0 })}
                min="0"
              />
              {tokenForm.action !== 'set' && (
                <p className="text-xs text-muted-foreground">
                  New balance will be:{' '}
                  {tokenForm.action === 'add'
                    ? (editingQuota?.tokenBalance || 0) + tokenForm.amount
                    : Math.max(0, (editingQuota?.tokenBalance || 0) - tokenForm.amount)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTokenDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveTokens} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan</DialogTitle>
            <DialogDescription>
              Change subscription plan for {editingQuota?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Current Plan</span>
                <Badge className="capitalize">{editingQuota?.currentPlan}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Token Balance</span>
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-amber-500" />
                  <span className="font-bold">
                    {editingQuota ? formatTokens(editingQuota.tokenBalance) : '0'}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>New Plan</Label>
              <Select 
                value={planForm.planId} 
                onValueChange={(value) => setPlanForm({ planId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailablePlans().map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{plan.name}</span>
                        {plan.tokenCost > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({plan.tokenCost} tokens/month)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {planForm.planId && RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS] && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <p className="text-sm font-medium">Plan Details</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">vCPUs:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].quotas.maxVCpus}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Memory:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].quotas.maxMemoryMB / 1024}GB
                  </div>
                  <div>
                    <span className="text-muted-foreground">Disk:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].quotas.maxDiskGB}GB
                  </div>
                  <div>
                    <span className="text-muted-foreground">VMs:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].quotas.maxVMs}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Containers:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].quotas.maxContainers}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cost:</span>{' '}
                    {RESOURCE_PLANS[planForm.planId as keyof typeof RESOURCE_PLANS].tokenCost} tokens/month
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSavePlan} disabled={submitting}>
              {submitting ? 'Changing...' : 'Change Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
