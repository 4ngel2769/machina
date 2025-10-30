'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Container,
  Server,
  List,
  Settings,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export function QuickActionsPanel() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const actions = [
    {
      icon: Container,
      label: 'Create Container',
      onClick: () => router.push('/containers?action=create'),
      shortcut: 'C',
    },
    {
      icon: Server,
      label: 'Create VM',
      onClick: () => router.push('/vms?action=create'),
      shortcut: 'V',
    },
    {
      separator: true,
    },
    {
      icon: List,
      label: 'View All Containers',
      onClick: () => router.push('/containers'),
      shortcut: 'Shift+C',
    },
    {
      icon: List,
      label: 'View All VMs',
      onClick: () => router.push('/vms'),
      shortcut: 'Shift+V',
    },
    {
      separator: true,
    },
    {
      icon: Settings,
      label: 'System Settings',
      onClick: () => router.push('/settings'),
      shortcut: 'S',
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg"
            aria-label="Quick Actions"
          >
            <Plus className={`h-6 w-6 transition-transform ${isOpen ? 'rotate-45' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {actions.map((action, index) => {
            if ('separator' in action) {
              return <DropdownMenuSeparator key={`separator-${index}`} />;
            }

            const Icon = action.icon;
            return (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                className="cursor-pointer"
              >
                <Icon className="mr-2 h-4 w-4" />
                <span className="flex-1">{action.label}</span>
                {action.shortcut && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {action.shortcut}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
