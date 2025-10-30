'use client';

import { useState, useEffect } from 'react';
import { SystemStats } from '@/types/api';

export function useStats() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Implement real-time stats via WebSocket
    // For now, using mock data
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // Mock data for now
        const mockStats: SystemStats = {
          cpu: {
            usage: 45.2,
            cores: 8,
            model: 'Intel Core i7',
          },
          memory: {
            total: 16384,
            used: 8192,
            free: 8192,
            percent: 50,
          },
          disk: {
            total: 512000,
            used: 256000,
            free: 256000,
            percent: 50,
          },
          network: {
            rx: 1024 * 1024 * 100, // 100 MB
            tx: 1024 * 1024 * 50,  // 50 MB
          },
        };
        
        setStats(mockStats);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    
    // Refresh stats every 5 seconds
    const interval = setInterval(fetchStats, 5000);
    
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    loading,
    error,
  };
}
