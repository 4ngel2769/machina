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
  Terminal,
  Search,
} from 'lucide-react';

export function CommandPalette() {
  const router = useRouter();
  const { containers, startContainer, stopContainer } = useContainers();
  const { vms, startVM, stopVM } = useVMs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

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
