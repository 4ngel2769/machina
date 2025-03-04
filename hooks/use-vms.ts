'use client';

import { useState, useEffect } from 'react';
import { VirtualMachine } from '@/types/vm';

export function useVMs() {
  const [vms, setVMs] = useState<VirtualMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Implement API call to fetch VMs
    // For now, using mock data
    const fetchVMs = async () => {
      try {
        setLoading(true);
        
        // Mock data for now
        const mockVMs: VirtualMachine[] = [
          {
            id: '1',
            name: 'ubuntu-dev',
            status: 'running',
            memory: 4096,
            vcpus: 2,
            disk: [
              { path: '/var/lib/libvirt/images/ubuntu-dev.qcow2', size: 50, format: 'qcow2', device: 'disk' }
            ],
            os_variant: 'ubuntu22.04',
            created: new Date(),
          },
          {
            id: '2',
            name: 'windows-test',
            status: 'stopped',
            memory: 8192,
            vcpus: 4,
            disk: [
              { path: '/var/lib/libvirt/images/windows-test.qcow2', size: 100, format: 'qcow2', device: 'disk' }
            ],
            os_variant: 'win10',
            created: new Date(),
          },
        ];
        
        setVMs(mockVMs);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch VMs');
      } finally {
        setLoading(false);
      }
    };

    fetchVMs();
  }, []);

  const refreshVMs = async () => {
    // TODO: Implement refresh
  };

  return {
    vms,
    loading,
    error,
    refreshVMs,
  };
}
