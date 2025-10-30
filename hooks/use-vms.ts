import { create } from 'zustand';
import { VirtualMachine, StoragePool, VirtualNetwork } from '@/types/vm';

interface VMStore {
  // VM State
  vms: VirtualMachine[];
  selectedVM: VirtualMachine | null;
  isLoading: boolean;
  error: string | null;
  
  // Storage Pool State
  storagePools: StoragePool[];
  poolsLoading: boolean;
  
  // Virtual Network State
  networks: VirtualNetwork[];
  networksLoading: boolean;
  
  // Auto-refresh
  autoRefresh: boolean;
  refreshInterval: NodeJS.Timeout | null;
  
  // VM Actions
  fetchVMs: () => Promise<void>;
  refreshVMsStats: () => Promise<void>;
  setSelectedVM: (vm: VirtualMachine | null) => void;
  createVM: (data: Record<string, unknown>) => Promise<void>;
  startVM: (id: string) => Promise<void>;
  stopVM: (id: string) => Promise<void>;
  forceStopVM: (id: string) => Promise<void>;
  pauseVM: (id: string) => Promise<void>;
  resumeVM: (id: string) => Promise<void>;
  deleteVM: (id: string) => Promise<void>;
  
  // Storage Pool Actions
  fetchStoragePools: () => Promise<void>;
  createStoragePool: (data: { name: string; path: string; type: string }) => Promise<void>;
  deleteStoragePool: (name: string) => Promise<void>;
  
  // Virtual Network Actions
  fetchNetworks: () => Promise<void>;
  createNetwork: (data: {
    name: string;
    mode: 'nat' | 'bridge' | 'isolated';
    ip_range?: string;
    dhcp_enabled: boolean;
  }) => Promise<void>;
  deleteNetwork: (name: string) => Promise<void>;
  startNetwork: (name: string) => Promise<void>;
  stopNetwork: (name: string) => Promise<void>;
  
  // Settings
  setAutoRefresh: (enabled: boolean) => void;
  startPolling: (interval?: number) => void;
  stopPolling: () => void;
}

export const useVMs = create<VMStore>((set, get) => ({
  // Initial State
  vms: [],
  selectedVM: null,
  isLoading: false,
  error: null,
  storagePools: [],
  poolsLoading: false,
  networks: [],
  networksLoading: false,
  autoRefresh: false,
  refreshInterval: null,
  
  // Fetch all VMs
  fetchVMs: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/vms');
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch VMs');
      }
      const data = await response.json();
      set({ vms: data.vms || [], isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch VMs',
        isLoading: false,
      });
    }
  },

  // Refresh VMs stats without loading state
  refreshVMsStats: async () => {
    try {
      const response = await fetch('/api/vms');
      if (response.ok) {
        const data = await response.json();
        const newVMs = data.vms || [];
        
        // Only update state if data actually changed (prevent unnecessary re-renders)
        const currentVMs = get().vms;
        const hasChanged = JSON.stringify(currentVMs) !== JSON.stringify(newVMs);
        
        if (hasChanged) {
          set({ vms: newVMs });
        }
      }
    } catch (error) {
      console.error('Error refreshing VM stats:', error);
    }
  },
  
  // Set selected VM
  setSelectedVM: (vm) => set({ selectedVM: vm }),
  
  // Create new VM
  createVM: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create VM');
      }
      
      // Refresh VM list
      await get().fetchVMs();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create VM',
        isLoading: false,
      });
      throw error;
    }
  },
  
  // Start VM
  startVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}/start`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.map((vm) =>
          vm.id === id ? { ...vm, status: 'running' as const } : vm
        ),
      }));
      
      // Refresh to get actual status
      setTimeout(() => get().fetchVMs(), 1000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start VM',
      });
      throw error;
    }
  },
  
  // Stop VM (graceful shutdown)
  stopVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}/stop`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to stop VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.map((vm) =>
          vm.id === id ? { ...vm, status: 'shut off' as const } : vm
        ),
      }));
      
      // Refresh to get actual status
      setTimeout(() => get().fetchVMs(), 1000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to stop VM',
      });
      throw error;
    }
  },
  
  // Force stop VM (destroy)
  forceStopVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}/force-stop`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to force stop VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.map((vm) =>
          vm.id === id ? { ...vm, status: 'shut off' as const } : vm
        ),
      }));
      
      // Refresh to get actual status
      setTimeout(() => get().fetchVMs(), 1000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to force stop VM',
      });
      throw error;
    }
  },
  
  // Pause VM
  pauseVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}/pause`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to pause VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.map((vm) =>
          vm.id === id ? { ...vm, status: 'paused' as const } : vm
        ),
      }));
      
      // Refresh to get actual status
      setTimeout(() => get().fetchVMs(), 1000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to pause VM',
      });
      throw error;
    }
  },
  
  // Resume VM
  resumeVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}/resume`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resume VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.map((vm) =>
          vm.id === id ? { ...vm, status: 'running' as const } : vm
        ),
      }));
      
      // Refresh to get actual status
      setTimeout(() => get().fetchVMs(), 1000);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to resume VM',
      });
      throw error;
    }
  },
  
  // Delete VM
  deleteVM: async (id) => {
    try {
      const response = await fetch(`/api/vms/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete VM');
      }
      
      // Optimistic update
      set((state) => ({
        vms: state.vms.filter((vm) => vm.id !== id),
        selectedVM: state.selectedVM?.id === id ? null : state.selectedVM,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete VM',
      });
      throw error;
    }
  },
  
  // Fetch storage pools
  fetchStoragePools: async () => {
    set({ poolsLoading: true });
    try {
      const response = await fetch('/api/storage/pools');
      if (!response.ok) {
        throw new Error('Failed to fetch storage pools');
      }
      const data = await response.json();
      set({ storagePools: data.pools || [], poolsLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch storage pools',
        poolsLoading: false,
      });
    }
  },
  
  // Create storage pool
  createStoragePool: async (data) => {
    set({ poolsLoading: true });
    try {
      const response = await fetch('/api/storage/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create storage pool');
      }
      
      // Refresh pools
      await get().fetchStoragePools();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create storage pool',
        poolsLoading: false,
      });
      throw error;
    }
  },
  
  // Delete storage pool
  deleteStoragePool: async (name) => {
    try {
      const response = await fetch(`/api/storage/pools/${name}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete storage pool');
      }
      
      // Optimistic update
      set((state) => ({
        storagePools: state.storagePools.filter((pool) => pool.name !== name),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete storage pool',
      });
      throw error;
    }
  },
  
  // Fetch networks
  fetchNetworks: async () => {
    set({ networksLoading: true });
    try {
      const response = await fetch('/api/networks');
      if (!response.ok) {
        throw new Error('Failed to fetch networks');
      }
      const data = await response.json();
      set({ networks: data.networks || [], networksLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch networks',
        networksLoading: false,
      });
    }
  },
  
  // Create network
  createNetwork: async (data) => {
    set({ networksLoading: true });
    try {
      const response = await fetch('/api/networks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create network');
      }
      
      // Refresh networks
      await get().fetchNetworks();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create network',
        networksLoading: false,
      });
      throw error;
    }
  },
  
  // Delete network
  deleteNetwork: async (name) => {
    try {
      const response = await fetch(`/api/networks/${name}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete network');
      }
      
      // Optimistic update
      set((state) => ({
        networks: state.networks.filter((net) => net.name !== name),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete network',
      });
      throw error;
    }
  },
  
  // Start network
  startNetwork: async (name) => {
    try {
      const response = await fetch(`/api/networks/${name}/start`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start network');
      }
      
      // Refresh networks
      await get().fetchNetworks();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to start network',
      });
      throw error;
    }
  },
  
  // Stop network
  stopNetwork: async (name) => {
    try {
      const response = await fetch(`/api/networks/${name}/stop`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to stop network');
      }
      
      // Refresh networks
      await get().fetchNetworks();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to stop network',
      });
      throw error;
    }
  },
  
  // Set auto-refresh
  setAutoRefresh: (enabled) => {
    set({ autoRefresh: enabled });
    if (enabled) {
      get().startPolling();
    } else {
      get().stopPolling();
    }
  },

  startPolling: (interval = 3000) => {
    const state = get();
    if (state.refreshInterval) {
      clearInterval(state.refreshInterval);
    }
    
    const intervalId = setInterval(() => {
      get().refreshVMsStats();
    }, interval);
    
    set({ refreshInterval: intervalId, autoRefresh: true });
  },

  stopPolling: () => {
    const state = get();
    if (state.refreshInterval) {
      clearInterval(state.refreshInterval);
      set({ refreshInterval: null, autoRefresh: false });
    }
  },
}));
