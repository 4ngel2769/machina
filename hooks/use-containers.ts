'use client';

import { create } from 'zustand';
import { Container, CreateContainerRequest, ContainerStatus } from '@/types/container';

interface ContainerStore {
  containers: Container[];
  loading: boolean;
  error: string | null;
  isAutoRefreshEnabled: boolean;
  
  // Actions
  fetchContainers: () => Promise<void>;
  createContainer: (config: CreateContainerRequest) => Promise<void>;
  startContainer: (id: string) => Promise<void>;
  stopContainer: (id: string) => Promise<void>;
  restartContainer: (id: string) => Promise<void>;
  deleteContainer: (id: string) => Promise<void>;
  refreshStats: () => Promise<void>;
  setAutoRefresh: (enabled: boolean) => void;
}

export const useContainers = create<ContainerStore>((set, get) => ({
  containers: [],
  loading: false,
  error: null,
  isAutoRefreshEnabled: false,

  fetchContainers: async () => {
    try {
      set({ loading: true, error: null });
      const response = await fetch('/api/containers');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch containers: ${response.statusText}`);
      }
      
      const data = await response.json();
      set({ containers: data.data || [], loading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch containers';
      set({ error: errorMessage, loading: false });
      console.error('Error fetching containers:', error);
    }
  },

  createContainer: async (config: CreateContainerRequest) => {
    try {
      set({ loading: true, error: null });
      const response = await fetch('/api/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create container');
      }
      
      // Refresh container list
      await get().fetchContainers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create container';
      set({ error: errorMessage, loading: false });
      throw error;
    }
  },

  startContainer: async (id: string) => {
    try {
      set({ error: null });
      const response = await fetch(`/api/containers/${id}/start`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start container');
      }
      
      // Optimistic update
      set((state) => ({
        containers: state.containers.map((c) =>
          c.id === id ? { ...c, status: 'running' as ContainerStatus } : c
        ),
      }));
      
      // Refresh to get accurate state
      setTimeout(() => get().fetchContainers(), 500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start container';
      set({ error: errorMessage });
      throw error;
    }
  },

  stopContainer: async (id: string) => {
    try {
      set({ error: null });
      const response = await fetch(`/api/containers/${id}/stop`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to stop container');
      }
      
      // Optimistic update
      set((state) => ({
        containers: state.containers.map((c) =>
          c.id === id ? { ...c, status: 'exited' as ContainerStatus } : c
        ),
      }));
      
      // Refresh to get accurate state
      setTimeout(() => get().fetchContainers(), 500);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop container';
      set({ error: errorMessage });
      throw error;
    }
  },

  restartContainer: async (id: string) => {
    try {
      set({ error: null });
      const response = await fetch(`/api/containers/${id}/restart`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restart container');
      }
      
      // Optimistic update
      set((state) => ({
        containers: state.containers.map((c) =>
          c.id === id ? { ...c, status: 'restarting' as ContainerStatus } : c
        ),
      }));
      
      // Refresh to get accurate state
      setTimeout(() => get().fetchContainers(), 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to restart container';
      set({ error: errorMessage });
      throw error;
    }
  },

  deleteContainer: async (id: string) => {
    try {
      set({ error: null });
      const response = await fetch(`/api/containers/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete container');
      }
      
      // Optimistic update - remove from list
      set((state) => ({
        containers: state.containers.filter((c) => c.id !== id),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete container';
      set({ error: errorMessage });
      // Refresh to restore accurate state on error
      get().fetchContainers();
      throw error;
    }
  },

  refreshStats: async () => {
    // Refresh stats for running containers without showing loading state
    try {
      const response = await fetch('/api/containers');
      if (response.ok) {
        const data = await response.json();
        set({ containers: data.data || [] });
      }
    } catch (error) {
      console.error('Error refreshing stats:', error);
    }
  },

  setAutoRefresh: (enabled: boolean) => {
    set({ isAutoRefreshEnabled: enabled });
  },
}));

