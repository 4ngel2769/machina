'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useContainers } from '@/hooks/use-containers';
import { useVMs } from '@/hooks/use-vms';
import { useLiveStats } from '@/hooks/use-live-stats';
import { StatCard } from '@/components/dashboard/stat-card';
import { SystemHealthIndicator } from '@/components/dashboard/health-indicator';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { QuickActionsPanel } from '@/components/dashboard/quick-actions';
import { DashboardSettingsPanel } from '@/components/dashboard/settings-panel';
import { Button } from '@/components/ui/button';
import {
  Cpu,
  HardDrive,
  Network,
  MemoryStick,
  ArrowRight,
  Server,
  Container,
  Settings,
} from 'lucide-react';
import { getSystemHealth } from '@/lib/thresholds';
import { monitorAllThresholds } from '@/lib/notification-monitor';
import {
  loadDashboardSettings,
  saveDashboardSettings,
  resetDashboardSettings,
  type DashboardSettings,
} from '@/lib/dashboard-settings';
import { formatBytes, formatUptime } from '@/lib/utils';
import type { ResourceTimeSeries } from '@/types/stats';
import Link from 'next/link';

export default function DashboardPage() {
  const { data: session } = useSession();
  const { containers, loading: containersLoading } = useContainers();
  const { vms, isLoading: vmsLoading } = useVMs();
  
  // Load dashboard settings
  const [settings, setSettings] = useState<DashboardSettings>(() => loadDashboardSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Use settings refresh interval
  const { stats, isLoading: statsLoading } = useLiveStats({
    updateInterval: settings.refreshInterval,
  });

  // Time series data for charts (last 60 data points = 2 minutes at 2s intervals)
  const [cpuHistory, setCpuHistory] = useState<ResourceTimeSeries[]>([]);
  const [memoryHistory, setMemoryHistory] = useState<ResourceTimeSeries[]>([]);
  const [networkHistory, setNetworkHistory] = useState<ResourceTimeSeries[]>([]);

  // Monitor thresholds and trigger notifications
  useEffect(() => {
    if (!stats) return;
    monitorAllThresholds(stats);
  }, [stats]);

  // Update history when stats change
  useEffect(() => {
    if (!stats) return;

    const timestamp = Date.now();

    setCpuHistory(prev => [
      ...prev.slice(-59),
      { timestamp, value: stats.host.cpu.usage },
    ]);

    setMemoryHistory(prev => [
      ...prev.slice(-59),
      { timestamp, value: stats.host.memory.percentage },
    ]);

    // Network as a percentage (arbitrary scale for visualization)
    const networkPercent = Math.min(
      ((stats.host.network.rx_rate + stats.host.network.tx_rate) / (1024 * 1024)) * 10,
      100
    );
    setNetworkHistory(prev => [
      ...prev.slice(-59),
      { timestamp, value: networkPercent },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.timestamp]); // Only depend on timestamp to avoid excessive updates

  const runningContainers = containers.filter(c => c.status === 'running');
  const runningVMs = vms.filter(vm => vm.status === 'running');

  const health = useMemo(() => {
    if (!stats) {
      return {
        status: 'healthy' as const,
        issues: [],
        metrics: { cpu: 0, memory: 0, disk: 0 },
      };
    }
    return getSystemHealth(stats.host, stats.containers, stats.vms);
  }, [stats]);

  const isLoading = containersLoading || vmsLoading || statsLoading;

  // Settings handlers
  const handleSettingsChange = (newSettings: DashboardSettings) => {
    setSettings(newSettings);
    saveDashboardSettings(newSettings);
    // Reload page to apply refresh interval change
    window.location.reload();
  };

  const handleResetSettings = () => {
    const defaults = resetDashboardSettings();
    setSettings(defaults);
    // Reload page to apply changes
    window.location.reload();
  };

  // Determine color theme based on value
  const getColorTheme = (value: number): 'default' | 'success' | 'warning' | 'danger' => {
    if (value >= 95) return 'danger';
    if (value >= 80) return 'warning';
    if (value >= 60) return 'default';
    return 'success';
  };

  return (
    <div className={`space-y-6 pb-20 ${settings.compactMode ? 'space-y-4' : 'space-y-6'}`}>
      {/* Header with Health Indicator */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time monitoring and system overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          {settings.showSystemHealth && stats && <SystemHealthIndicator health={health} />}
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Stats Cards - Admin Only */}
      {session?.user?.role === 'admin' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="CPU Usage"
            value={stats ? `${stats.host.cpu.usage.toFixed(1)}%` : '—'}
            subtitle={stats ? `${stats.host.cpu.cores} cores` : 'Loading...'}
            icon={Cpu}
            chartData={cpuHistory}
            chartType="area"
            chartColor={
              (stats?.host.cpu.usage ?? 0) >= 90 ? '#ef4444' :
              (stats?.host.cpu.usage ?? 0) >= 80 ? '#eab308' :
              '#3b82f6'
            }
            colorTheme={stats ? getColorTheme(stats.host.cpu.usage) : 'default'}
            isLoading={isLoading}
          />

          <StatCard
            title="Memory Usage"
            value={
              stats
                ? `${formatBytes(stats.host.memory.used)} / ${formatBytes(stats.host.memory.total)}`
                : '—'
            }
            subtitle={stats ? `${stats.host.memory.percentage.toFixed(1)}% used` : 'Loading...'}
            icon={MemoryStick}
            chartData={memoryHistory}
            chartType="area"
            chartColor={
              (stats?.host.memory.percentage ?? 0) >= 95 ? '#ef4444' :
              (stats?.host.memory.percentage ?? 0) >= 90 ? '#eab308' :
              '#10b981'
            }
            colorTheme={stats ? getColorTheme(stats.host.memory.percentage) : 'default'}
            isLoading={isLoading}
          />

          <StatCard
            title="Disk Usage"
            value={
              stats
                ? `${formatBytes(stats.host.disk.used)} / ${formatBytes(stats.host.disk.total)}`
                : '—'
            }
            subtitle={stats ? `${stats.host.disk.percentage.toFixed(1)}% used` : 'Loading...'}
            icon={HardDrive}
            colorTheme={stats ? getColorTheme(stats.host.disk.percentage) : 'default'}
            isLoading={isLoading}
          />

          <StatCard
            title="Network"
            value={
              stats
                ? `↓ ${formatBytes(stats.host.network.rx_rate)}/s`
                : '—'
            }
            subtitle={
              stats
                ? `↑ ${formatBytes(stats.host.network.tx_rate)}/s`
                : 'Loading...'
            }
            icon={Network}
            chartData={networkHistory}
            chartType="line"
            chartColor="#8b5cf6"
            isLoading={isLoading}
          />
        </div>
      )}

      {/* System Overview - Admin Only */}
      {session?.user?.role === 'admin' && stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Uptime</span>
            </div>
            <div className="text-2xl font-bold">
              {formatUptime(stats.host.uptime)}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Operating System</span>
            </div>
            <div className="text-lg font-semibold truncate" title={stats.host.os?.distro}>
              {stats.host.os?.distro || 'Unknown'}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.host.os?.kernel}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Resources</span>
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-2xl font-bold">{containers.length}</div>
                <div className="text-xs text-muted-foreground">Containers</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{vms.length}</div>
                <div className="text-xs text-muted-foreground">VMs</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Resources - Always Visible */}
      {(!stats || session?.user?.role !== 'admin') && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Your Resources</span>
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-2xl font-bold">{containers.length}</div>
                <div className="text-xs text-muted-foreground">Containers</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{vms.length}</div>
                <div className="text-xs text-muted-foreground">VMs</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Resources */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Containers */}
        {settings.showContainersSection && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Container className="h-5 w-5" />
                Active Containers
              </h2>
              <Link href="/containers">
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          {runningContainers.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Container className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No running containers</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runningContainers.slice(0, 5).map((container) => {
                const containerStats = stats?.containers.find(
                  c => c.name === container.name
                );
                return (
                  <div
                    key={container.id}
                    className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{container.name}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                        Running
                      </span>
                    </div>
                    {containerStats && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>CPU: {containerStats.cpu.toFixed(1)}%</span>
                        <span>
                          Memory: {formatBytes(containerStats.memory.usage)} (
                          {containerStats.memory.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        )}

        {/* Active VMs */}
        {settings.showVMsSection && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Server className="h-5 w-5" />
                Active VMs
            </h2>
            <Link href="/vms">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-4 w-4" />
              </Button>
            </Link>
          </div>
          {runningVMs.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Server className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No running VMs</p>
            </div>
          ) : (
            <div className="space-y-3">
              {runningVMs.slice(0, 5).map((vm) => {
                const vmStats = stats?.vms.find(v => v.name === vm.name);
                return (
                  <div
                    key={vm.name}
                    className="rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{vm.name}</span>
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                        Running
                      </span>
                    </div>
                    {vmStats && (
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>CPU: {vmStats.cpu.usage.toFixed(1)}%</span>
                        <span>
                          Memory: {(vmStats.memory.used / 1024).toFixed(0)} MB (
                          {vmStats.memory.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      {settings.showActivityFeed && <ActivityFeed maxItems={10} />}

      {/* Quick Actions Panel */}
      {settings.showQuickActions && <QuickActionsPanel />}

      {/* Settings Dialog */}
      <DashboardSettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onReset={handleResetSettings}
      />
    </div>
  );
}
