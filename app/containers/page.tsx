'use client';

import { useEffect, useState } from 'react';
import { useContainers } from '@/hooks/use-containers';
import { useLiveStats } from '@/hooks/use-live-stats';
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
import { Plus, Search, RefreshCw, AlertCircle, Box } from 'lucide-react';

export default function ContainersPage() {
  const { containers, loading, error, fetchContainers, setAutoRefresh } = useContainers();
  const { stats } = useLiveStats(); // Get live stats
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'running' | 'stopped'>('all');

  // Fetch containers on mount and enable auto-refresh
  useEffect(() => {
    fetchContainers();
    setAutoRefresh(true);

    // Set up auto-refresh interval (3 seconds)
    const interval = setInterval(() => {
      fetchContainers();
    }, 3000);

    return () => {
      clearInterval(interval);
      setAutoRefresh(false);
    };
  }, [fetchContainers, setAutoRefresh]);

  // Filter containers
  const filteredContainers = containers.filter((container) => {
    // Filter by search query
    const matchesSearch =
      container.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      container.image.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Filter by status tab
    if (filterTab === 'running') {
      return container.status === 'running';
    } else if (filterTab === 'stopped') {
      return container.status !== 'running';
    }

    return true;
  });

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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as typeof filterTab)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All ({containers.length})</TabsTrigger>
            <TabsTrigger value="running">Running ({runningCount})</TabsTrigger>
            <TabsTrigger value="stopped">Stopped ({stoppedCount})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search containers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Container Grid */}
      {loading && containers.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filteredContainers.length === 0 ? (
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
          {filteredContainers.map((container) => {
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

