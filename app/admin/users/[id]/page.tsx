'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield,
  Ban,
  CheckCircle,
  Server,
  Container as ContainerIcon,
  Coins,
  Activity,
  ArrowLeft,
  Trash2,
  Play,
  Square,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface UserDetails {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date | string;
  suspended: boolean;
  plan: string;
  tokens: number;
  vms_current: number;
  vms_max: number;
  containers_current: number;
  containers_max: number;
  storage_current: number;
  storage_max: number;
}

interface UserVM {
  id: string;
  name: string;
  status: string;
  memory: number;
  vcpus: number;
  userId: string;
}

interface UserContainer {
  id: string;
  name: string;
  status: string;
  image: string;
  userId: string;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = params.id as string;

  const [user, setUser] = useState<UserDetails | null>(null);
  const [vms, setVMs] = useState<UserVM[]>([]);
  const [containers, setContainers] = useState<UserContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Check admin access
  useEffect(() => {
    if (session && session.user?.role !== 'admin') {
      router.push('/');
      toast.error('Access denied');
    }
  }, [session, router]);

  // Fetch user details
  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch user info and quota
      const [userRes, quotaRes, vmsRes, containersRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch(`/api/admin/quotas/${userId}`),
        fetch(`/api/admin/users/${userId}/vms`),
        fetch(`/api/admin/users/${userId}/containers`),
      ]);

      if (!userRes.ok) {
        throw new Error('Failed to fetch user details');
      }

      const [userData, quotaData, vmsData, containersData] = await Promise.all([
        userRes.json(),
        quotaRes.ok ? quotaRes.json() : null,
        vmsRes.ok ? vmsRes.json() : { vms: [] },
        containersRes.ok ? containersRes.json() : { containers: [] },
      ]);

      setUser({ ...userData, ...quotaData });
      setVMs(vmsData.vms || []);
      setContainers(containersData.containers || []);
    } catch (error) {
      console.error('Error fetching user details:', error);
      toast.error('Failed to load user details');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspendUser = async () => {
    if (!user) return;
    
    try {
      setActionLoading(true);
      const response = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend: !user.suspended }),
      });

      if (!response.ok) throw new Error('Failed to update user status');

      toast.success(user.suspended ? 'User activated' : 'User suspended');
      fetchUserDetails();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVMAction = async (vmId: string, action: 'start' | 'stop' | 'delete') => {
    try {
      setActionLoading(true);
      
      let endpoint = '';
      let method = 'POST';
      
      if (action === 'delete') {
        endpoint = `/api/vms/${vmId}`;
        method = 'DELETE';
      } else {
        endpoint = `/api/vms/${vmId}/${action}`;
      }
      
      const response = await fetch(endpoint, { method });
      if (!response.ok) throw new Error(`Failed to ${action} VM`);
      
      toast.success(`VM ${action}ed successfully`);
      fetchUserDetails();
    } catch (error) {
      console.error(`Error ${action}ing VM:`, error);
      toast.error(`Failed to ${action} VM`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleContainerAction = async (containerId: string, action: 'start' | 'stop' | 'delete') => {
    try {
      setActionLoading(true);
      
      let endpoint = '';
      let method = 'POST';
      
      if (action === 'delete') {
        endpoint = `/api/containers/${containerId}`;
        method = 'DELETE';
      } else {
        endpoint = `/api/containers/${containerId}/${action}`;
      }
      
      const response = await fetch(endpoint, { method });
      if (!response.ok) throw new Error(`Failed to ${action} container`);
      
      toast.success(`Container ${action}ed successfully`);
      fetchUserDetails();
    } catch (error) {
      console.error(`Error ${action}ing container:`, error);
      toast.error(`Failed to ${action} container`);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading user details...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>User Not Found</CardTitle>
            <CardDescription>The requested user could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/admin')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/admin')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{user.name}</h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={user.suspended ? 'destructive' : 'default'}>
            {user.suspended ? 'Suspended' : 'Active'}
          </Badge>
          <Badge variant="outline">
            <Shield className="h-3 w-3 mr-1" />
            {user.role}
          </Badge>
        </div>
      </div>

      {/* User Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Status</CardTitle>
            {user.suspended ? <Ban className="h-4 w-4 text-destructive" /> : <CheckCircle className="h-4 w-4 text-green-500" />}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {user.suspended ? 'Suspended' : 'Active'}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatDistanceToNow(new Date(user.createdAt))} ago
            </p>
            <Button
              className="w-full mt-4"
              variant={user.suspended ? 'default' : 'destructive'}
              size="sm"
              onClick={handleSuspendUser}
              disabled={actionLoading}
            >
              {user.suspended ? 'Activate User' : 'Suspend User'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">{user.plan}</div>
            <p className="text-xs text-muted-foreground">
              {user.tokens} tokens available
            </p>
            <div className="mt-2 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">VMs:</span>
                <span>{user.vms_current}/{user.vms_max === -1 ? '∞' : user.vms_max}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Containers:</span>
                <span>{user.containers_current}/{user.containers_max === -1 ? '∞' : user.containers_max}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resources</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">VMs</span>
                </div>
                <span className="text-2xl font-bold">{vms.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ContainerIcon className="h-4 w-4 text-purple-500" />
                  <span className="text-sm">Containers</span>
                </div>
                <span className="text-2xl font-bold">{containers.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for VMs, Containers, and Logs */}
      <Tabs defaultValue="vms" className="w-full">
        <TabsList>
          <TabsTrigger value="vms">
            <Server className="h-4 w-4 mr-2" />
            Virtual Machines ({vms.length})
          </TabsTrigger>
          <TabsTrigger value="containers">
            <ContainerIcon className="h-4 w-4 mr-2" />
            Containers ({containers.length})
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="h-4 w-4 mr-2" />
            Activity Logs
          </TabsTrigger>
        </TabsList>

        {/* VMs Tab */}
        <TabsContent value="vms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Virtual Machines</CardTitle>
              <CardDescription>All VMs owned by this user</CardDescription>
            </CardHeader>
            <CardContent>
              {vms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No virtual machines
                </div>
              ) : (
                <div className="space-y-2">
                  {vms.map((vm) => (
                    <div
                      key={vm.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Server className="h-8 w-8 text-blue-500" />
                        <div>
                          <div className="font-medium">{vm.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {vm.memory}MB RAM · {vm.vcpus} vCPUs
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={vm.status === 'running' ? 'default' : 'secondary'}>
                          {vm.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVMAction(vm.id, vm.status === 'running' ? 'stop' : 'start')}
                          disabled={actionLoading}
                        >
                          {vm.status === 'running' ? (
                            <Square className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVMAction(vm.id, 'delete')}
                          disabled={actionLoading}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Containers Tab */}
        <TabsContent value="containers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Containers</CardTitle>
              <CardDescription>All containers owned by this user</CardDescription>
            </CardHeader>
            <CardContent>
              {containers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No containers
                </div>
              ) : (
                <div className="space-y-2">
                  {containers.map((container) => (
                    <div
                      key={container.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <ContainerIcon className="h-8 w-8 text-purple-500" />
                        <div>
                          <div className="font-medium">{container.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {container.image}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={container.status === 'running' ? 'default' : 'secondary'}>
                          {container.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleContainerAction(container.id, container.status === 'running' ? 'stop' : 'start')}
                          disabled={actionLoading}
                        >
                          {container.status === 'running' ? (
                            <Square className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleContainerAction(container.id, 'delete')}
                          disabled={actionLoading}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity Logs</CardTitle>
              <CardDescription>User activity and system events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Activity logging system coming soon...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
