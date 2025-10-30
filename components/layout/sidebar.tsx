'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { 
  Home, 
  Box, 
  Monitor, 
  Plus, 
  Settings, 
  ChevronLeft,
  ChevronRight,
  Menu,
  LogOut,
  User,
  Shield,
  Search,
  Command
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: () => void;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: Home },
  { label: 'Containers', href: '/containers', icon: Box },
  { label: 'Virtual Machines', href: '/vms', icon: Monitor },
  { label: 'Admin Panel', href: '/admin', icon: Shield, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const { data: session } = useSession();
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

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' });
  };

  const isActive = (href: string) => pathname === href;

  const getUserInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-[60px]' : 'w-60'
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
              <h1 className="text-xl font-bold bg-linear-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                Machina
              </h1>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1">
            {navItems.map((item) => {
              // Skip admin-only items for non-admin users
              if (item.adminOnly && session?.user?.role !== 'admin') {
                return null;
              }

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
                    <Icon className="w-5 h-5 shrink-0" />
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
                  <Icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}

            <Separator className="my-2" />

            {/* Command Palette Trigger */}
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start gap-3 text-muted-foreground',
                isCollapsed && 'justify-center px-2'
              )}
              onClick={() => {
                const event = new KeyboardEvent('keydown', {
                  key: 'k',
                  code: 'KeyK',
                  metaKey: true,
                  ctrlKey: true,
                  bubbles: true
                });
                window.dispatchEvent(event);
              }}
              title={isCollapsed ? 'Search (Cmd+K)' : undefined}
            >
              <Search className="w-5 h-5 shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Search...</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <Command className="h-3 w-3" />K
                  </kbd>
                </>
              )}
            </Button>

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
              <Plus className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span>Create New</span>}
            </Button>
          </nav>

          {/* User Section */}
          <div className="p-2 border-t">
            {session?.user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      'w-full justify-start gap-3 h-auto py-2',
                      isCollapsed && 'justify-center px-2'
                    )}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getUserInitials(session.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    {!isCollapsed && (
                      <div className="flex flex-col items-start text-left overflow-hidden">
                        <span className="text-sm font-medium truncate w-full">
                          {session.user.name}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {session.user.role}
                        </span>
                      </div>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

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
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 border-b bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60 flex items-center px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <div className="flex flex-col h-full">
              {/* Logo */}
              <div className="h-14 flex items-center justify-center border-b">
                <h1 className="text-xl font-bold bg-linear-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
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

              {/* User Section - Mobile */}
              <div className="p-2 border-t">
                {session?.user && (
                  <>
                    <div className="flex items-center gap-3 px-3 py-2 mb-2">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {getUserInitials(session.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">{session.user.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {session.user.role}
                        </span>
                      </div>
                    </div>
                    <Separator className="mb-2" />
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 text-destructive hover:text-destructive"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-5 h-5" />
                      <span>Logout</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <h1 className="ml-4 text-lg font-bold bg-linear-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
          Machina
        </h1>
      </div>
    </>
  );
}
