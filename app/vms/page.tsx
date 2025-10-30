'use client';

import { useEffect, useState, useMemo } from 'react';
import { useVMs } from '@/hooks/use-vms';
import { useLiveStats } from '@/hooks/use-live-stats';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Search, RefreshCw, Server, AlertCircle, Filter, ArrowUpDown } from 'lucide-react';
import { VMCard } from '@/components/vms/vm-card';
import { CreateVMDialog } from '@/components/vms/create-vm-dialog';
import { StoragePoolsDialog } from '@/components/vms/storage-pools-dialog';
import { VirtualNetworksDialog } from '@/components/vms/virtual-networks-dialog';

type FilterStatus = 'all' | 'running' | 'stopped' | 'paused';
type SortOption = 'name-asc' | 'name-desc' | 'cpu-desc' | 'memory-desc';

export default function VirtualMachinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { vms, isLoading, error, fetchVMs, setAutoRefresh } = useVMs();
  const { stats } = useLiveStats(); // Get live stats
  
  // Filter and sort state from URL
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(
    (searchParams.get('status') as FilterStatus) || 'all'
  );
  const [osFilter, setOsFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) || 'name-asc'
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [storageDialogOpen, setStorageDialogOpen] = useState(false);
  const [networksDialogOpen, setNetworksDialogOpen] = useState(false);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (filterStatus !== 'all') params.set('status', filterStatus);
    if (sortBy !== 'name-asc') params.set('sort', sortBy);
    
    const newUrl = params.toString() ? `?${params.toString()}` : '/vms';
    router.replace(newUrl, { scroll: false });
  }, [searchQuery, filterStatus, sortBy, router]);

  // Fetch VMs on mount
  useEffect(() => {
    fetchVMs();
    setAutoRefresh(true);

    return () => {
      setAutoRefresh(false);
    };
  }, [fetchVMs, setAutoRefresh]);

  // Filter and sort VMs
  const filteredAndSortedVMs = useMemo(() => {
    const filtered = vms.filter((vm) => {
      // Filter by search query
      const matchesSearch = vm.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           vm.os_variant?.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Filter by status
      if (filterStatus === 'running' && vm.status !== 'running') return false;
      if (filterStatus === 'stopped' && vm.status !== 'shut off' && vm.status !== 'stopped') return false;
      if (filterStatus === 'paused' && vm.status !== 'paused' && vm.status !== 'suspended') return false;

      // Filter by OS
      if (osFilter.length > 0 && vm.os_variant) {
        if (!osFilter.some(os => vm.os_variant?.toLowerCase().includes(os.toLowerCase()))) {
          return false;
        }
      }
      
      return true;
    });

    // Sort VMs
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'cpu-desc': {
          const aCpu = stats?.vms.find(s => s.name === a.name)?.cpu;
          const bCpu = stats?.vms.find(s => s.name === b.name)?.cpu;
          const aCpuUsage = typeof aCpu === 'object' ? aCpu.usage : 0;
          const bCpuUsage = typeof bCpu === 'object' ? bCpu.usage : 0;
          return bCpuUsage - aCpuUsage;
        }
        case 'memory-desc': {
          const aMemory = stats?.vms.find(s => s.name === a.name)?.memory;
          const bMemory = stats?.vms.find(s => s.name === b.name)?.memory;
          const aMemPct = typeof aMemory === 'object' ? aMemory.percentage : 0;
          const bMemPct = typeof bMemory === 'object' ? bMemory.percentage : 0;
          return bMemPct - aMemPct;
        }
        default:
          return 0;
      }
    });
  }, [vms, searchQuery, filterStatus, osFilter, sortBy, stats]);

  // Get unique OS types for filter
  const osTypes = useMemo(() => {
    const types = new Set(
      vms
        .map(vm => vm.os_variant)
        .filter(Boolean)
        .map(os => os?.split('-')[0]) // Get base OS name (e.g., 'ubuntu' from 'ubuntu-22.04')
    );
    return Array.from(types).sort();
  }, [vms]);

  // Count VMs by status
  const runningCount = vms.filter(vm => vm.status === 'running').length;
  const stoppedCount = vms.filter(vm => vm.status === 'shut off' || vm.status === 'stopped').length;
  const pausedCount = vms.filter(vm => vm.status === 'paused' || vm.status === 'suspended').length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-8 w-8" />
            Virtual Machines
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your virtual machines, storage pools, and networks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setStorageDialogOpen(true)}
          >
            Storage Pools
          </Button>
          <Button
            variant="outline"
            onClick={() => setNetworksDialogOpen(true)}
          >
            Networks
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create VM
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Virtual Machines</CardTitle>
              <CardDescription>
                {filteredVMs.length} of {vms.length} VMs
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchVMs()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant={autoRefresh ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Filter Tabs */}
          <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                All ({vms.length})
              </TabsTrigger>
              <TabsTrigger value="running" className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                  {runningCount}
                </Badge>
                Running
              </TabsTrigger>
              <TabsTrigger value="stopped" className="flex items-center gap-2">
                <Badge variant="secondary">
                  {stoppedCount}
                </Badge>
                Stopped
              </TabsTrigger>
              <TabsTrigger value="paused" className="flex items-center gap-2">
                <Badge variant="outline">
                  {pausedCount}
                </Badge>
                Paused
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search and Filters */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search VMs by name or OS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* OS Filter */}
            {osTypes.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Filter by OS</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {osTypes.map((os) => (
                    <DropdownMenuCheckboxItem
                      key={os}
                      checked={osFilter.includes(os)}
                      onCheckedChange={(checked) => {
                        setOsFilter(
                          checked
                            ? [...osFilter, os]
                            : osFilter.filter((o) => o !== os)
                        );
                      }}
                    >
                      {os?.charAt(0).toUpperCase() + os?.slice(1)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="cpu-desc">Highest CPU</SelectItem>
                <SelectItem value="memory-desc">Highest Memory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* VM Grid */}
      {isLoading && vms.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredVMs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No virtual machines found</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery
                ? `No VMs match "${searchQuery}"`
                : 'Get started by creating your first virtual machine'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First VM
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVMs.map((vm) => {
            // Find matching live stats for this VM
            const vmStats = stats?.vms.find((s) => s.name === vm.name);
            
            return (
              <VMCard key={vm.id} vm={vm} liveStats={vmStats} />
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateVMDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <StoragePoolsDialog
        open={storageDialogOpen}
        onOpenChange={setStorageDialogOpen}
      />
      <VirtualNetworksDialog
        open={networksDialogOpen}
        onOpenChange={setNetworksDialogOpen}
      />
    </div>
  );
}
