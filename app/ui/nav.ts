/**
 * Navigation groups shared by the desktop dock and the mobile dock.
 * Both surfaces must offer the same destinations with the same active rule.
 */

export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { id: string; label: string; icon: IconName; items: NavItem[]; admin?: boolean };

import type { IconName } from '@/app/ui/icons';

export const GROUPS: NavGroup[] = [
  {
    id: 'compute', label: 'compute', icon: 'server',
    items: [
      { href: '/home', label: 'overview', icon: 'activity' },
      { href: '/instances', label: 'instances', icon: 'layers' },
      { href: '/specs', label: 'plans & images', icon: 'file-text' },
      { href: '/isos', label: 'isos', icon: 'disc' },
      { href: '/my-containers', label: 'my containers', icon: 'package' },
    ],
  },
  {
    id: 'containers', label: 'containers', icon: 'package', admin: true,
    items: [
      { href: '/containers', label: 'all containers', icon: 'package' },
    ],
  },
  {
    id: 'admin', label: 'admin', icon: 'key', admin: true,
    items: [
      { href: '/admin', label: 'overview', icon: 'activity' },
      { href: '/admin/users', label: 'users & quotas', icon: 'key' },
      { href: '/admin/requests', label: 'requests', icon: 'inbox' },
      { href: '/admin/images', label: 'images', icon: 'hard-drive' },
      { href: '/admin/plans', label: 'plans', icon: 'file-text' },
      { href: '/admin/audit', label: 'audit', icon: 'clock' },
      { href: '/host', label: 'host machines', icon: 'server' },
      { href: '/host/isos', label: 'ISO library', icon: 'disc' },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function groupHasActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isActive(pathname, item.href));
}
