'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HostStats, ContainerStats, VMStats, LiveStatsData } from '@/types/stats';

interface UseLiveStatsOptions {
  autoConnect?: boolean;
  updateInterval?: number; // milliseconds
  onError?: (error: Error) => void;
}

interface UseLiveStatsReturn {
  stats: LiveStatsData | null;
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  disconnect: () => void;
  connect: () => void;
}

export function useLiveStats(options: UseLiveStatsOptions = {}): UseLiveStatsReturn {
  const {
    autoConnect = true,
    updateInterval = 2000, // 2 seconds default
    onError,
  } = options;

  const [stats, setStats] = useState<LiveStatsData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch all stats in parallel
      const [hostRes, containersRes, vmsRes] = await Promise.all([
        fetch('/api/stats/host'),
        fetch('/api/stats/containers'),
        fetch('/api/stats/vms'),
      ]);

      if (!hostRes.ok || !containersRes.ok || !vmsRes.ok) {
        throw new Error('Failed to fetch stats');
      }

      const [hostData, containersData, vmsData] = await Promise.all([
        hostRes.json() as Promise<HostStats>,
        containersRes.json() as Promise<{ containers: ContainerStats[] }>,
        vmsRes.json() as Promise<{ vms: VMStats[] }>,
      ]);

      if (isMountedRef.current) {
        const newStats = {
          host: hostData,
          containers: containersData.containers,
          vms: vmsData.vms,
          timestamp: Date.now(),
        };
        
        // Only update state if data actually changed (prevent unnecessary re-renders)
        const hasChanged = JSON.stringify(stats) !== JSON.stringify(newStats);
        
        if (hasChanged || isLoading) {
          setStats(newStats);
          setError(null);
          setIsLoading(false);
          setIsConnected(true);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      if (isMountedRef.current) {
        setError(error);
        setIsLoading(false);
        setIsConnected(false);
      }
      onError?.(error);
    }
  }, [onError, stats, isLoading]);

  const connect = useCallback(() => {
    if (intervalRef.current) return;

    setIsConnected(true);
    fetchStats(); // Initial fetch

    intervalRef.current = setInterval(() => {
      fetchStats();
    }, updateInterval);
  }, [fetchStats, updateInterval]);

  const disconnect = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const refetch = useCallback(async () => {
    await fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    isMountedRef.current = true;

    if (autoConnect) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    stats,
    isConnected,
    isLoading,
    error,
    refetch,
    disconnect,
    connect,
  };
}
