'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const { containers, startContainer, stopContainer } = useContainers();
  const { vms, startVM, stopVM } = useVMs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [awaitingNavKey, setAwaitingNavKey] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
        return;
      }

      // Handle navigation shortcuts (G + letter)
      if (awaitingNavKey) {
        e.preventDefault();
        e.stopPropagation();
        
        switch (e.key.toLowerCase()) {
          case 'd':
            router.push('/');
            break;
          case 'c':
            router.push('/containers');
            break;
          case 'v':
            router.push('/vms');
            break;
          case 's':
            router.push('/settings');
            break;
        }
        setAwaitingNavKey(false);
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
      } else if (e.key === 'g') {
        // Start navigation mode
        setAwaitingNavKey(true);
        // Clear the awaiting state after 2 seconds if no key is pressed
        setTimeout(() => setAwaitingNavKey(false), 2000);
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
  }, [router, awaitingNavKey]);

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

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => closeAndNavigate('/')}
            className="cursor-pointer"
          >
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem
            onSelect={() => closeAndNavigate('/containers')}
            className="cursor-pointer"
          >
            <Box className="mr-2 h-4 w-4" />
            Containers
          </CommandItem>
          <CommandItem
            onSelect={() => closeAndNavigate('/vms')}
            className="cursor-pointer"
          >
            <Server className="mr-2 h-4 w-4" />
            Virtual Machines
          </CommandItem>
          <CommandItem
            onSelect={() => closeAndNavigate('/settings')}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
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
