'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useContainers } from '@/hooks/use-containers';
import { useVMs } from '@/hooks/use-vms';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Container,
  Box,
  Server,
  Play,
  Square,
  Plus,
  Home,
  Settings,
  LayoutDashboard,
  Search,
} from 'lucide-react';

// Global function to trigger command palette
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).toggleCommandPalette = () => {
    window.dispatchEvent(new CustomEvent('toggle-command-palette'));
  };
}

export function CommandPalette() {
  const router = useRouter();
  const { data: session } = useSession();
  const { containers, startContainer, stopContainer } = useContainers();
  const { vms, startVM, stopVM } = useVMs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Handle navigation shortcuts (Shift + letter)
      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'd':
            e.preventDefault();
            router.push('/');
            break;
          case 'c':
            e.preventDefault();
            router.push('/containers');
            break;
          case 'v':
            e.preventDefault();
            router.push('/vms');
            break;
          case 's':
            e.preventDefault();
            router.push('/settings');
            break;
          case 'n':
            e.preventDefault();
            // Context-aware create new
            const currentPath = window.location.pathname;
            if (currentPath.startsWith('/containers')) {
              router.push('/containers?action=create');
            } else if (currentPath.startsWith('/vms')) {
              router.push('/vms?action=create');
            } else {
              // Default to containers
              router.push('/containers?action=create');
            }
            break;
          case 'r':
            e.preventDefault();
            window.location.reload();
            break;
        }
        return;
      }

      // Global shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'k':
            e.preventDefault();
            e.stopPropagation();
            setOpen((open) => !open);
            break;
          case 'f':
            e.preventDefault();
            // Focus search input if it exists, otherwise open command palette
            const searchInput = document.querySelector('input[placeholder*="search" i]') as HTMLInputElement;
            if (searchInput) {
              searchInput.focus();
            } else {
              setOpen(true);
            }
            break;
          case 'b':
            e.preventDefault();
            // Toggle sidebar - dispatch custom event
            window.dispatchEvent(new CustomEvent('toggle-sidebar'));
            break;
        }
      } else if (e.key === '?') {
        e.preventDefault();
        router.push('/help');
      }
    };

    // Custom event listener for programmatic toggle
    const toggleHandler = () => {
      setOpen((open) => !open);
    };

    document.addEventListener('keydown', down);
    window.addEventListener('toggle-command-palette', toggleHandler);
    
    return () => {
      document.removeEventListener('keydown', down);
      window.removeEventListener('toggle-command-palette', toggleHandler);
    };
  }, [router]);

  const closeAndNavigate = useCallback((path: string) => {
    setOpen(false);
    setSearch('');
    router.push(path);
  }, [router]);

  const closeAndAction = useCallback(async (action: () => Promise<void>) => {
    setOpen(false);
    setSearch('');
    await action();
  }, []);

  // Define all available pages and actions
  const allPages = [
    // User pages (always available)
    { title: 'Dashboard', path: '/', icon: Home, keywords: ['home', 'overview', 'stats', 'dashboard'], user: true, admin: true },
    { title: 'Containers', path: '/containers', icon: Box, keywords: ['containers', 'docker', 'apps', 'services'], user: true, admin: true },
    { title: 'Virtual Machines', path: '/vms', icon: Server, keywords: ['vms', 'virtual machines', 'servers', 'hypervisor'], user: true, admin: true },
    { title: 'Settings', path: '/settings', icon: Settings, keywords: ['settings', 'preferences', 'config', 'profile'], user: true, admin: true },
    { title: 'Profile', path: '/profile', icon: LayoutDashboard, keywords: ['profile', 'account', 'user', 'tokens'], user: true, admin: true },
    { title: 'Help', path: '/help', icon: Search, keywords: ['help', 'documentation', 'guide', 'support'], user: true, admin: true },

    // Admin-only pages
    { title: 'Admin Dashboard', path: '/admin', icon: LayoutDashboard, keywords: ['admin', 'administration', 'management'], user: false, admin: true },
    { title: 'User Management', path: '/admin/users', icon: LayoutDashboard, keywords: ['users', 'accounts', 'management'], user: false, admin: true },
    { title: 'Token Management', path: '/admin/tokens', icon: LayoutDashboard, keywords: ['tokens', 'requests', 'approvals'], user: false, admin: true },
    { title: 'System Logs', path: '/admin/logs', icon: LayoutDashboard, keywords: ['logs', 'system', 'events', 'audit'], user: false, admin: true },
    { title: 'Backup Management', path: '/admin/backup', icon: LayoutDashboard, keywords: ['backup', 'restore', 'data'], user: false, admin: true },
    { title: 'Pricing Templates', path: '/admin/pricing', icon: LayoutDashboard, keywords: ['pricing', 'plans', 'billing'], user: false, admin: true },
    { title: 'Global Settings', path: '/admin/settings', icon: LayoutDashboard, keywords: ['global', 'system', 'configuration'], user: false, admin: true },
  ];

  // Fuzzy search function
  const fuzzySearch = (query: string, text: string): boolean => {
    if (!query) return true;
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Exact match
    if (textLower.includes(queryLower)) return true;
    
    // Fuzzy match - check if all characters in query appear in order in text
    let queryIndex = 0;
    for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
      if (textLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    return queryIndex === queryLower.length;
  };

  // Filter pages based on user role and search
  const filteredPages = allPages.filter(page => {
    const isAdmin = session?.user?.role === 'admin';
    const hasAccess = (isAdmin && page.admin) || (!isAdmin && page.user);
    
    if (!hasAccess) return false;
    
    // Search in title and keywords
    return fuzzySearch(search, page.title) || 
           page.keywords.some(keyword => fuzzySearch(search, keyword));
  });

  // Filter items based on search
  const filteredContainers = containers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.image.toLowerCase().includes(search.toLowerCase())
  );

  const filteredVMs = vms.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.os_variant?.toLowerCase() || '').includes(search.toLowerCase())
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Pages */}
        <CommandGroup heading="Pages">
          {filteredPages.map((page) => (
            <CommandItem
              key={page.path}
              onSelect={() => closeAndNavigate(page.path)}
              className="cursor-pointer"
            >
              <page.icon className="mr-2 h-4 w-4" />
              {page.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Quick Actions */}
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => closeAndNavigate('/containers?action=create')}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Container
          </CommandItem>
          <CommandItem
            onSelect={() => closeAndNavigate('/vms?action=create')}
            className="cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create VM
          </CommandItem>
        </CommandGroup>

        {/* Containers */}
        {filteredContainers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Containers">
              {filteredContainers.slice(0, 5).map((container) => (
                <CommandItem
                  key={container.id}
                  value={`container-${container.id}`}
                  onSelect={() => closeAndNavigate(`/containers/${container.id}`)}
                  className="cursor-pointer"
                >
                  <Container className="mr-2 h-4 w-4" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate">{container.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {container.image}
                    </span>
                  </div>
                  {container.status === 'running' ? (
                    <Square
                      className="ml-2 h-3 w-3 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeAndAction(() => stopContainer(container.id));
                      }}
                    />
                  ) : (
                    <Play
                      className="ml-2 h-3 w-3 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeAndAction(() => startContainer(container.id));
                      }}
                    />
                  )}
                </CommandItem>
              ))}
              {filteredContainers.length > 5 && (
                <CommandItem
                  onSelect={() => closeAndNavigate('/containers')}
                  className="cursor-pointer text-muted-foreground"
                >
                  <Search className="mr-2 h-4 w-4" />
                  View all {filteredContainers.length} containers...
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}

        {/* Virtual Machines */}
        {filteredVMs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Virtual Machines">
              {filteredVMs.slice(0, 5).map((vm) => (
                <CommandItem
                  key={vm.id}
                  value={`vm-${vm.id}`}
                  onSelect={() => closeAndNavigate(`/vms/${vm.name}`)}
                  className="cursor-pointer"
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="truncate">{vm.name}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {vm.os_variant || 'Unknown OS'}
                    </span>
                  </div>
                  {vm.status === 'running' ? (
                    <Square
                      className="ml-2 h-3 w-3 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeAndAction(() => stopVM(vm.id));
                      }}
                    />
                  ) : (vm.status === 'shut off' || vm.status === 'stopped') ? (
                    <Play
                      className="ml-2 h-3 w-3 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeAndAction(() => startVM(vm.id));
                      }}
                    />
                  ) : null}
                </CommandItem>
              ))}
              {filteredVMs.length > 5 && (
                <CommandItem
                  onSelect={() => closeAndNavigate('/vms')}
                  className="cursor-pointer text-muted-foreground"
                >
                  <Search className="mr-2 h-4 w-4" />
                  View all {filteredVMs.length} VMs...
                </CommandItem>
              )}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
