/**
 * Left sidebar navigation: grouped, collapsible sections with icons.
 * Replaces the old top tab bar — categories make room for the docker plane
 * and future sections without crowding a horizontal strip.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import { Icon, ChevronDownIcon, ChevronRightIcon, type IconName } from '@/app/ui/icons';
import { Bell } from '@/app/ui/bell';

export const SIDEBAR_TOGGLE_EVENT = 'machina:sidebar';

export function toggleSidebar() {
  window.dispatchEvent(new CustomEvent(SIDEBAR_TOGGLE_EVENT));
}

type NavItem = { href: string; label: string; icon: IconName };
type NavGroup = { id: string; label: string; icon: IconName; items: NavItem[]; admin?: boolean };

const GROUPS: NavGroup[] = [
  {
    id: 'compute', label: 'compute', icon: 'server',
    items: [
      { href: '/home', label: 'overview', icon: 'activity' },
      { href: '/instances', label: 'instances', icon: 'layers' },
      { href: '/specs', label: 'plans & images', icon: 'file-text' },
    ],
  },
  {
    id: 'containers', label: 'containers', icon: 'package', admin: true,
    items: [
      { href: '/containers', label: 'all containers', icon: 'package' },
    ],
  },
  {
    id: 'host', label: 'host', icon: 'hard-drive', admin: true,
    items: [
      { href: '/host', label: 'machines', icon: 'server' },
      { href: '/host/isos', label: 'iso library', icon: 'disc' },
    ],
  },
  {
    id: 'account', label: 'account', icon: 'key',
    items: [
      { href: '/keys', label: 'ssh keys', icon: 'key' },
      { href: '/billing', label: 'billing', icon: 'activity' },
      { href: '/account', label: 'profile', icon: 'inbox' },
      { href: '/notifications', label: 'notifications', icon: 'bell' },
      { href: '/tokens', label: 'api tokens', icon: 'key' },
    ],
  },
  {
    id: 'admin', label: 'admin', icon: 'power', admin: true,
    items: [
      { href: '/admin', label: 'console', icon: 'power' },
      { href: '/terms', label: 'terms', icon: 'file-text' },
      { href: '/privacy', label: 'privacy', icon: 'file-text' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/home') return pathname === '/home' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function groupHasActive(pathname: string, group: NavGroup): boolean {
  return group.items.some((item) => isActive(pathname, item.href));
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      className={`snav-link${active ? ' active' : ''}`}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      <span className="snav-icon"><Icon name={item.icon} size={16} /></span>
      {!collapsed && <span className="snav-label">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem('machina.sidebar');
      // mobile defaults to the drawer closed; an explicit saved choice wins
      const mobile = window.matchMedia('(max-width: 860px)').matches;
      setOpen(saved ? saved === 'open' : !mobile);
      const groups = localStorage.getItem('machina.sidebar.groups');
      if (groups) setClosedGroups(JSON.parse(groups));
    } catch { /* private mode */ }
    const onToggle = () => setOpen((was) => {
      const next = !was;
      try { localStorage.setItem('machina.sidebar', next ? 'open' : 'closed'); } catch { /* ignore */ }
      return next;
    });
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
  }, []);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('machina.sidebar.groups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const groups = GROUPS.filter((group) => !group.admin || role === 'admin');

  return (
    <>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-head">
          <Link href="/home" className="sidebar-brand">machina</Link>
          <button className="sidebar-collapse" onClick={toggleSidebar} aria-label={open ? 'collapse sidebar' : 'expand sidebar'} title="toggle sidebar [">
            <ChevronRightIcon size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {groups.map((group) => {
            const expanded = !closedGroups[group.id] && (open || groupHasActive(pathname, group));
            const active = groupHasActive(pathname, group);
            return (
              <div key={group.id} className={`snav-group${active ? ' active' : ''}`}>
                <button
                  className="snav-group-head"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                >
                  <span className="snav-icon"><Icon name={group.icon} size={16} /></span>
                  {open && (
                    <>
                      <span className="snav-label">{group.label}</span>
                      <span className="snav-chev"><ChevronDownIcon size={12} style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .18s ease' }} /></span>
                    </>
                  )}
                </button>
                {expanded && (
                  <div className="snav-items">
                    {group.items.map((item) => (
                      <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={!open} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <button className="profilebtn sidebar-profile" onClick={() => setMenuOpen((was) => !was)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <Blobatar name={name} size={22} animate="hover" />
              {open && <span>{name}</span>}
              {open && <ChevronDownIcon size={12} />}
            </button>
            {menuOpen && (
              <div className="profilemenu sidebar-menu" role="menu" onClick={() => setMenuOpen(false)}>
                <Link href="/account" role="menuitem">account</Link>
                <Link href="/notifications" role="menuitem">notifications</Link>
                <Link href="/tokens" role="menuitem">api tokens</Link>
                <div className="sep" />
                <Link href="/terms" role="menuitem">terms</Link>
                <Link href="/privacy" role="menuitem">privacy</Link>
                <div className="sep" />
                <button role="menuitem" onClick={() => signOut({ callbackUrl: '/signin' }).then(() => router.push('/signin'))}>
                  sign out
                </button>
              </div>
            )}
          </div>
          {open && <div className="sidebar-bell"><Bell /></div>}
        </div>
      </aside>
      {open && <div className="sidebar-backdrop" onClick={toggleSidebar} aria-hidden />}
      {!open && <button className="sidebar-peek" onClick={toggleSidebar} aria-label="expand sidebar" title="expand sidebar ["><Icon name="menu" size={15} /></button>}
    </>
  );
}
