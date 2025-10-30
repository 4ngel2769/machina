'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  Box, 
  Monitor, 
  Plus, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: () => void;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Containers', href: '/containers', icon: Box },
  { label: 'Virtual Machines', href: '/vms', icon: Monitor },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-collapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  const pathname = usePathname();

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(newState));
  };

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[60px]' : 'w-[240px]'
        )}
      >
        <div className="flex-1 flex flex-col">
          {/* Logo/Brand */}
          <div className="h-14 flex items-center justify-center border-b px-4">
            {isCollapsed ? (
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">M</span>
              </div>
            ) : (
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                Machina
              </h1>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.href ? isActive(item.href) : false;

              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                      'hover:bg-accent hover:text-accent-foreground',
                      active && 'bg-accent text-accent-foreground font-medium',
                      isCollapsed && 'justify-center'
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              }

              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
                    'hover:bg-accent hover:text-accent-foreground',
                    isCollapsed && 'justify-center'
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}

            <Separator className="my-2" />

            {/* Create New Button */}
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start gap-3',
                isCollapsed && 'justify-center px-2'
              )}
              title={isCollapsed ? 'Create New' : undefined}
            >
              <Plus className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>Create New</span>}
            </Button>
          </nav>

          {/* Toggle Button */}
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSidebar}
              className={cn('w-full', isCollapsed && 'px-2')}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <>
                  <ChevronLeft className="w-5 h-5 mr-2" />
                  <span className="text-sm">Collapse</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 flex items-center px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] p-0">
            <div className="flex flex-col h-full">
              {/* Logo */}
              <div className="h-14 flex items-center justify-center border-b">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                  Machina
                </h1>
              </div>

              {/* Navigation */}
              <nav className="flex-1 p-2 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.href ? isActive(item.href) : false;

                  if (item.href) {
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                          'hover:bg-accent hover:text-accent-foreground',
                          active && 'bg-accent text-accent-foreground font-medium'
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <Separator className="my-2" />

                <Button variant="outline" className="w-full justify-start gap-3">
                  <Plus className="w-5 h-5" />
                  <span>Create New</span>
                </Button>
              </nav>
            </div>
          </SheetContent>
        </Sheet>

        <h1 className="ml-4 text-lg font-bold bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Machina
        </h1>
      </div>
    </>
  );
}
