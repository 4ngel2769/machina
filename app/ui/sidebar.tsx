/**
 * Left navigation as a floating dock.
 *
 * Three states, one morphing panel:
 *   hidden — off-canvas; a pull-tab on the left edge or shift+D brings it back
 *   dock   — floating icon rail, inset from the viewport edges
 *   open   — full sidebar with group labels
 *
 * motion springs drive width/offsets/radius so dock -> sidebar reads as one
 * fluid shape change rather than two layouts swapping. The icon set is the
 * same in every state; only labels and chrome appear on expand.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { motion } from 'motion/react';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import { Icon, ChevronDownIcon, ChevronRightIcon, type IconName } from '@/app/ui/icons';
import { Bell } from '@/app/ui/bell';

export const SIDEBAR_TOGGLE_EVENT = 'machina:sidebar';
export const DOCK_SHOW_EVENT = 'machina:dock:show';

export function toggleSidebar() {
  window.dispatchEvent(new CustomEvent(SIDEBAR_TOGGLE_EVENT));
}

export function showDock() {
  window.dispatchEvent(new CustomEvent(DOCK_SHOW_EVENT));
}

export type DockMode = 'hidden' | 'dock' | 'open';
const MODE_KEY = 'machina.dock';

function readMode(): DockMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'hidden' || saved === 'dock' || saved === 'open') return saved;
  } catch { /* private mode */ }
  // mobile defaults to hidden; an explicit saved choice always wins
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches ? 'hidden' : 'dock';
}

function writeMode(mode: DockMode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
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

/** Dock-mode icon for a group: expands the sidebar on click. */
function DockIcon({ group, active, onExpand }: { group: NavGroup; active: boolean; onExpand: () => void }) {
  const first = group.items[0];
  return (
    <Link
      href={first.href}
      className={`dock-icon${active ? ' active' : ''}`}
      title={`${group.label} — expand`}
      aria-label={group.label}
      onClick={(event) => {
        // plain left click expands; the href still works for new-tab/middle-click
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault();
          onExpand();
        }
      }}
    >
      <Icon name={group.icon} size={17} />
    </Link>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className={`snav-link${active ? ' active' : ''}`}>
      <span className="snav-icon"><Icon name={item.icon} size={15} /></span>
      <span className="snav-label">{item.label}</span>
    </Link>
  );
}

function NavGroupBlock({ group, pathname, closed, onToggle }: {
  group: NavGroup; pathname: string; closed: boolean; onToggle: (id: string) => void;
}) {
  const expanded = !closed;
  const active = groupHasActive(pathname, group);
  return (
    <div className={`snav-group${active ? ' active' : ''}`}>
      <button className="snav-group-head" onClick={() => onToggle(group.id)} aria-expanded={expanded}>
        <span className="snav-icon"><Icon name={group.icon} size={16} /></span>
        <span className="snav-label">{group.label}</span>
        <span className="snav-chev"><ChevronDownIcon size={12} style={{ transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform .18s ease' }} /></span>
      </button>
      {expanded && (
        <div className="snav-items">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DockNav({ open, groups, pathname, closedGroups, onToggleGroup, onExpand }: {
  open: boolean; groups: NavGroup[]; pathname: string;
  closedGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void; onExpand: () => void;
}) {
  if (!open) {
    return (
      <div className="dock-icons">
        {groups.map((group) => (
          <DockIcon key={group.id} group={group} active={groupHasActive(pathname, group)} onExpand={onExpand} />
        ))}
      </div>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <NavGroupBlock
          key={group.id} group={group} pathname={pathname}
          closed={!!closedGroups[group.id]} onToggle={onToggleGroup}
        />
      ))}
    </>
  );
}

function DockFoot({ open, name }: { open: boolean; name: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="dock-foot">
      <div className="dock-user">
        <button className="profilebtn dock-profile" onClick={() => setMenuOpen((was) => !was)} aria-haspopup="menu" aria-expanded={menuOpen}>
          <Blobatar name={name} size={22} animate="hover" />
          {open && <span>{name}</span>}
          {open && <ChevronDownIcon size={12} />}
        </button>
        {menuOpen && (
          <div className="profilemenu dock-menu" role="menu" onClick={() => setMenuOpen(false)}>
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
      {open && <div className="dock-bell"><Bell /></div>}
    </div>
  );
}

/** Reserve the dock's gutter in the content column. The dock is position:fixed
 *  so it no longer pushes .main over; --dock-pad does that instead, and the
 *  CSS transition on .layout animates it alongside the spring. */
function useDockPad(mode: DockMode) {
  useEffect(() => {
    const pad = mode === 'open' ? 248 : mode === 'dock' ? 94 : 0;
    document.documentElement.style.setProperty('--dock-pad', `${pad}px`);
    return () => document.documentElement.style.setProperty('--dock-pad', '0px');
  }, [mode]);
}

const SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const;

/** Panel geometry per state — all numbers so springs interpolate cleanly. */
const GEOM = {
  dock: { left: 14, top: 14, bottom: 14, width: 68, radius: 18, x: 0 },
  open: { left: 0, top: 0, bottom: 0, width: 236, radius: 0, x: 0 },
  hidden: { left: 14, top: 14, bottom: 14, width: 68, radius: 18, x: '-140%' },
} as const;

export function Sidebar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<DockMode>('dock');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMode(readMode());
    try {
      const groups = localStorage.getItem('machina.sidebar.groups');
      if (groups) setClosedGroups(JSON.parse(groups));
    } catch { /* private mode */ }
  }, []);

  const setDockMode = useCallback((next: DockMode) => {
    setMode(next);
    writeMode(next);
  }, []);

  // `[` cycles hidden -> dock -> open; shift+D (DOCK_SHOW_EVENT) toggles
  // hidden <-> dock without disturbing an expanded sidebar.
  const cycle = useCallback(() => {
    setMode((was) => {
      const next: DockMode = was === 'hidden' ? 'dock' : was === 'dock' ? 'open' : 'hidden';
      writeMode(next);
      return next;
    });
  }, []);

  const showOrHide = useCallback(() => {
    setMode((was) => {
      const next: DockMode = was === 'hidden' ? 'dock' : 'hidden';
      writeMode(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onToggle = () => cycle();
    const onShow = () => showOrHide();
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
    window.addEventListener(DOCK_SHOW_EVENT, onShow);
    return () => {
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
      window.removeEventListener(DOCK_SHOW_EVENT, onShow);
    };
  }, [cycle, showOrHide]);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('machina.sidebar.groups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const groups = GROUPS.filter((group) => !group.admin || role === 'admin');
  const open = mode === 'open';
  const visible = mode !== 'hidden';
  const geom = GEOM[mode];

  useDockPad(mode);

  return (
    <>
      <motion.aside
        className={`dock${open ? ' open' : ''}`}
        initial={false}
        animate={{
          left: geom.left,
          top: geom.top,
          bottom: geom.bottom,
          width: geom.width,
          borderRadius: geom.radius,
          x: geom.x,
          opacity: visible ? 1 : 0,
        }}
        transition={SPRING}
        style={{ pointerEvents: visible ? 'auto' : 'none' }}
        aria-hidden={!visible}
      >
        <div className="dock-head">
          <Link href="/home" className="dock-brand" aria-label="machina home">machina</Link>
          <button
            className="dock-collapse"
            onClick={cycle}
            aria-label={open ? 'collapse to dock' : mode === 'dock' ? 'expand sidebar' : 'show navigation'}
            title={open ? 'collapse' : 'expand'}
          >
            <ChevronRightIcon size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
          </button>
        </div>

        <nav className="dock-nav">
          <DockNav
            open={open} groups={groups} pathname={pathname}
            closedGroups={closedGroups} onToggleGroup={toggleGroup}
            onExpand={() => setDockMode('open')}
          />
        </nav>

        <DockFoot open={open} name={name} />
      </motion.aside>

      {/* pull-tab: the way back when the dock is hidden */}
      {!visible && (
        <button className="dock-tab" onClick={() => setDockMode('dock')} aria-label="show navigation" title="show navigation (shift+D)">
          <Icon name="menu" size={15} />
        </button>
      )}
      {open && <div className="dock-backdrop" onClick={() => setDockMode('dock')} aria-hidden />}
    </>
  );
}
