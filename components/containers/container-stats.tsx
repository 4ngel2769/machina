'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, MemoryStick, HardDrive, Network, Activity, Clock } from 'lucide-react';
import { Container } from '@/types/container';

interface ContainerStatsProps {
  container: Container;
}

interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
  pids: number;
}

export function ContainerStats({ container }: ContainerStatsProps) {
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!container.id) return;

    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/containers/${container.id}/stats`);
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 3000);

    return () => clearInterval(interval);
  }, [container.id]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatUptime = () => {
    if (!container.created) return 'Unknown';
    const created = container.created instanceof Date 
      ? container.created 
      : new Date(container.created);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    }
    return `${diffHours}h`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-2">
          <Activity className="h-12 w-12 animate-pulse mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (!stats && container.status !== 'running') {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-2">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Container is {container.status}. Stats only available when running.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CPU Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.cpu_percent.toFixed(2) ?? '0.00'}%
            </div>
            <div className="w-full bg-secondary h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(stats?.cpu_percent ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total CPU utilization
            </p>
          </CardContent>
        </Card>

        {/* Memory Usage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatBytes(stats?.memory_usage ?? 0)}
            </div>
            <div className="w-full bg-secondary h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-purple-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(stats?.memory_percent ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatBytes(stats?.memory_limit ?? 0)} limit
              {stats && ` • ${stats.memory_percent.toFixed(1)}%`}
            </p>
          </CardContent>
        </Card>

        {/* Network I/O */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network I/O</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">RX:</span>
                <span className="text-sm font-medium">
                  {formatBytes(stats?.network_rx ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">TX:</span>
                <span className="text-sm font-medium">
                  {formatBytes(stats?.network_tx ?? 0)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total transferred since start
            </p>
          </CardContent>
        </Card>

        {/* Block I/O */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Block I/O</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Read:</span>
                <span className="text-sm font-medium">
                  {formatBytes(stats?.block_read ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Write:</span>
                <span className="text-sm font-medium">
                  {formatBytes(stats?.block_write ?? 0)}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Total disk operations
            </p>
          </CardContent>
        </Card>

        {/* Processes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processes</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pids ?? 0}</div>
            <Badge variant="outline" className="mt-2">
              {container.status}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Running PIDs
            </p>
          </CardContent>
        </Card>

        {/* Uptime */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatUptime()}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Created: {container.created instanceof Date 
                ? container.created.toLocaleDateString() 
                : new Date(container.created).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground space-y-1 mt-4">
        <p>📊 <strong>Real-time:</strong> Statistics update every 3 seconds</p>
        <p>💾 <strong>Memory:</strong> Shows current usage vs allocated limit</p>
        <p>🌐 <strong>Network:</strong> Total bytes received (RX) and transmitted (TX)</p>
      </div>
    </div>
  );
}
