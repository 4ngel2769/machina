'use client';

import { Suspense } from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useContainers } from '@/hooks/use-containers';
import { useLiveStats } from '@/hooks/use-live-stats';
import { useSearchParams, useRouter } from 'next/navigation';
import { Container } from '@/types/container';
import { ContainerCard } from '@/components/containers/container-card';
import { CreateContainerDialog } from '@/components/containers/create-dialog';
import { Terminal } from '@/components/containers/terminal';
import { LogsViewer } from '@/components/containers/logs-viewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Plus, Search, RefreshCw, AlertCircle, Box, Filter, ArrowUpDown } from 'lucide-react';

type SortOption = 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'cpu-desc' | 'memory-desc';

function ContainersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { containers, loading, error, fetchContainers, setAutoRefresh } = useContainers();
  const { stats } = useLiveStats(); // Get live stats
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  
  // Filter and sort state from URL
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [filterTab, setFilterTab] = useState<'all' | 'running' | 'stopped'>(
    (searchParams.get('status') as 'all' | 'running' | 'stopped') || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [imageFilter, setImageFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>(
    (searchParams.get('sort') as SortOption) || 'name-asc'
  );

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (filterTab !== 'all') params.set('status', filterTab);
    if (sortBy !== 'name-asc') params.set('sort', sortBy);
    
    const newUrl = params.toString() ? `?${params.toString()}` : '/containers';
    router.replace(newUrl, { scroll: false });
  }, [searchQuery, filterTab, sortBy, router]);

  // Fetch containers on mount and enable auto-refresh
  useEffect(() => {
    fetchContainers();
    setAutoRefresh(true);

    return () => {
      setAutoRefresh(false);
    };
  }, [fetchContainers, setAutoRefresh]);

  // Filter and sort containers
  const filteredAndSortedContainers = useMemo(() => {
    const filtered = containers.filter((container) => {
      // Filter by search query
      const matchesSearch =
        container.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        container.image.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Filter by status tab
      if (filterTab === 'running') {
        if (container.status !== 'running') return false;
      } else if (filterTab === 'stopped') {
        if (container.status === 'running') return false;
      }

      // Filter by type
      if (typeFilter.length > 0) {
        const containerType = container.type || 'normal';
        if (!typeFilter.includes(containerType)) return false;
      }

      // Filter by image
      if (imageFilter) {
        if (!container.image.toLowerCase().includes(imageFilter.toLowerCase())) return false;
      }

      return true;
    });

    // Sort containers
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'created-desc':
          return new Date(b.created).getTime() - new Date(a.created).getTime();
        case 'created-asc':
          return new Date(a.created).getTime() - new Date(b.created).getTime();
        case 'cpu-desc': {
          const aCpu = stats?.containers.find(s => s.id === a.id)?.cpu || 0;
          const bCpu = stats?.containers.find(s => s.id === b.id)?.cpu || 0;
          return bCpu - aCpu;
        }
        case 'memory-desc': {
          const aMemory = stats?.containers.find(s => s.id === a.id);
          const bMemory = stats?.containers.find(s => s.id === b.id);
          const aMemPct = typeof aMemory?.memory === 'object' ? aMemory.memory.percentage : 0;
          const bMemPct = typeof bMemory?.memory === 'object' ? bMemory.memory.percentage : 0;
          return bMemPct - aMemPct;
        }
        default:
          return 0;
      }
    });
  }, [containers, searchQuery, filterTab, typeFilter, imageFilter, sortBy, stats]);

  // Get unique container types and images for filters
  const containerTypes = useMemo(() => {
    const types = new Set(containers.map(c => c.type || 'normal'));
    return Array.from(types);
  }, [containers]);

  const containerImages = useMemo(() => {
    const images = new Set(containers.map(c => c.image.split(':')[0]));
    return Array.from(images).sort();
  }, [containers]);

  const runningCount = containers.filter((c) => c.status === 'running').length;
  const stoppedCount = containers.filter((c) => c.status !== 'running').length;

  const openTerminal = (container: Container) => {
    setSelectedContainer(container);
    setTerminalOpen(true);
  };

  const openLogs = (container: Container) => {
    setSelectedContainer(container);
    setLogsOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Box className="h-8 w-8 text-container-blue" />
            Containers
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your Docker containers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => fetchContainers()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Container
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

      {/* Filters and Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as typeof filterTab)} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all">All ({containers.length})</TabsTrigger>
              <TabsTrigger value="running">Running ({runningCount})</TabsTrigger>
              <TabsTrigger value="stopped">Stopped ({stoppedCount})</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2 flex-1">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search containers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Advanced Filters */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {containerTypes.map((type) => (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={typeFilter.includes(type)}
                    onCheckedChange={(checked) => {
                      setTypeFilter(
                        checked
                          ? [...typeFilter, type]
                          : typeFilter.filter((t) => t !== type)
                      );
                    }}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                <SelectItem value="created-desc">Newest First</SelectItem>
                <SelectItem value="created-asc">Oldest First</SelectItem>
                <SelectItem value="cpu-desc">Highest CPU</SelectItem>
                <SelectItem value="memory-desc">Highest Memory</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Container Grid */}
      {loading && containers.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredAndSortedContainers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Box className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery || filterTab !== 'all' ? 'No containers found' : 'No containers yet'}
          </h3>
          <p className="text-muted-foreground mb-4 max-w-md">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : "Get started by creating your first container. We recommend ParrotSec for security testing."}
          </p>
          {!searchQuery && filterTab === 'all' && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Container
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-in fade-in-50 duration-500">
          {filteredAndSortedContainers.map((container: Container) => {
            // Find matching live stats for this container
            const containerStats = stats?.containers.find((s) => s.id === container.id);
            
            return (
              <ContainerCard
                key={container.id}
                container={container}
                onTerminal={openTerminal}
                onLogs={openLogs}
                liveStats={containerStats}
              />
            );
          })}
        </div>
      )}

      {/* Create Container Dialog */}
      <CreateContainerDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      {/* Terminal Dialog */}
      <Terminal
        container={selectedContainer}
        open={terminalOpen}
        onClose={() => {
          setTerminalOpen(false);
          setSelectedContainer(null);
        }}
      />

      {/* Logs Viewer Dialog */}
      <LogsViewer
        container={selectedContainer}
        open={logsOpen}
        onClose={() => {
          setLogsOpen(false);
          setSelectedContainer(null);
        }}
      />
    </div>
  );
}

export default function ContainersPage() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="h-96 w-full" /></div>}>
      <ContainersPageContent />
    </Suspense>
  );
}

