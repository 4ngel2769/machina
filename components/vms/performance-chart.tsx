'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loader2, Activity, Cpu, HardDrive, Network } from 'lucide-react';
import { toast } from 'sonner';

interface VMStats {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  memoryTotal: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

interface PerformanceChartProps {
  vmName: string;
  refreshInterval?: number; // in milliseconds
  maxDataPoints?: number;
}

export function PerformanceChart({ 
  vmName, 
  refreshInterval = 2000,
  maxDataPoints = 30 
}: PerformanceChartProps) {
  const [stats, setStats] = useState<VMStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevStatsRef = useRef<VMStats | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/vms/${vmName}/stats`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      const currentStats: VMStats = {
        timestamp: Date.now(),
        cpuUsage: data.cpuUsage || 0,
        memoryUsage: data.memoryUsage || 0,
        memoryTotal: data.memoryTotal || 0,
        diskReadBytes: data.diskReadBytes || 0,
        diskWriteBytes: data.diskWriteBytes || 0,
        networkRxBytes: data.networkRxBytes || 0,
        networkTxBytes: data.networkTxBytes || 0,
      };

      setStats((prev) => {
        const updated = [...prev, currentStats];
        // Keep only the last maxDataPoints
        if (updated.length > maxDataPoints) {
          return updated.slice(updated.length - maxDataPoints);
        }
        return updated;
      });

      prevStatsRef.current = currentStats;
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching VM stats:', error);
      if (isLoading) {
        toast.error('Failed to load performance data');
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchStats();

    // Set up polling
    intervalRef.current = setInterval(fetchStats, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vmName, refreshInterval]);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Calculate rate of change for disk and network
  const chartData = stats.map((stat, index) => {
    const prev = index > 0 ? stats[index - 1] : stat;
    const timeDiff = (stat.timestamp - prev.timestamp) / 1000; // seconds

    const diskReadRate = timeDiff > 0 
      ? (stat.diskReadBytes - prev.diskReadBytes) / timeDiff 
      : 0;
    const diskWriteRate = timeDiff > 0 
      ? (stat.diskWriteBytes - prev.diskWriteBytes) / timeDiff 
      : 0;
    const networkRxRate = timeDiff > 0 
      ? (stat.networkRxBytes - prev.networkRxBytes) / timeDiff 
      : 0;
    const networkTxRate = timeDiff > 0 
      ? (stat.networkTxBytes - prev.networkTxBytes) / timeDiff 
      : 0;

    return {
      time: formatTime(stat.timestamp),
      cpu: Number(stat.cpuUsage.toFixed(1)),
      memory: Number(((stat.memoryUsage / stat.memoryTotal) * 100).toFixed(1)),
      diskRead: Number((diskReadRate / 1024).toFixed(2)), // KB/s
      diskWrite: Number((diskWriteRate / 1024).toFixed(2)), // KB/s
      networkRx: Number((networkRxRate / 1024).toFixed(2)), // KB/s
      networkTx: Number((networkTxRate / 1024).toFixed(2)), // KB/s
    };
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Performance Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* CPU Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" />
            CPU Usage
          </CardTitle>
          <CardDescription>Real-time CPU utilization</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="cpu" 
                stroke="#8884d8" 
                fill="#8884d8" 
                fillOpacity={0.3}
                name="CPU %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Memory Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Memory Usage
          </CardTitle>
          <CardDescription>Real-time memory utilization</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Area 
                type="monotone" 
                dataKey="memory" 
                stroke="#82ca9d" 
                fill="#82ca9d" 
                fillOpacity={0.3}
                name="Memory %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Disk I/O */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="h-4 w-4" />
            Disk I/O
          </CardTitle>
          <CardDescription>Disk read/write rates</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis unit=" KB/s" />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="diskRead" 
                stroke="#ffc658" 
                name="Read (KB/s)"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="diskWrite" 
                stroke="#ff7c7c" 
                name="Write (KB/s)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Network I/O */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-4 w-4" />
            Network I/O
          </CardTitle>
          <CardDescription>Network receive/transmit rates</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis unit=" KB/s" />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="networkRx" 
                stroke="#8dd1e1" 
                name="Receive (KB/s)"
                dot={false}
              />
              <Line 
                type="monotone" 
                dataKey="networkTx" 
                stroke="#d084d0" 
                name="Transmit (KB/s)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
