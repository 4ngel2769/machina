/**
 * Left navigation as a floating dock.
 *
 * Two states, one morphing panel:
 *   dock — floating icon rail, inset from the viewport edges
 *   open — full sidebar with group labels
 *
 * motion springs drive width/offsets/radius so dock -> sidebar reads as one
 * fluid shape change rather than two layouts swapping. The icon set is the
 * same in every state; only labels and chrome appear on expand.
 *
 * The bottom popup holds account-level actions. Admin work has its own
 * role-gated nav group so it does not get buried in that menu.
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

export type DockMode = 'dock' | 'open';
const MODE_KEY = 'machina.dock';

function readMode(): DockMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    if (saved === 'dock' || saved === 'open') return saved;
  } catch { /* private mode */ }
  return 'dock';
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

/** The user popup: every account/settings/admin destination in one menu.
 *  stopPropagation on the menu matters: it is a sibling of the trigger
 *  inside .dock-user, and a click on a menu item must not bubble back into
 *  anything that toggles the menu closed before navigation runs. */
function UserMenu({ name, role, onClose }: { name: string; role: string; onClose: () => void }) {
  const router = useRouter();
  const isAdmin = role === 'admin';
  return (
    <nav
      className="profilemenu dock-menu" aria-label="account menu"
      onClick={(event) => { event.stopPropagation(); onClose(); }}
    >
      <div className="dock-menu-head">
        <Blobatar name={name} size={26} animate="hover" />
        <div>
          <div className="dock-menu-name">{name}</div>
          <div className="dock-menu-role">{isAdmin ? 'admin' : 'user'}</div>
        </div>
      </div>
      <div className="sep" />
      <Link href="/account">settings</Link>
      <Link href="/notifications">notifications</Link>
      <Link href="/keys">ssh keys</Link>
      <Link href="/billing">billing</Link>
      <Link href="/tokens">api tokens</Link>
      <div className="sep" />
      <Link href="/terms">terms</Link>
      <Link href="/privacy">privacy</Link>
      <div className="sep" />
      <button onClick={() => signOut({ callbackUrl: '/signin' }).then(() => router.push('/signin'))}>
        sign out
      </button>
    </nav>
  );
}

function DockFoot({ open, name, role, menuOpen, setMenuOpen }: {
  open: boolean; name: string; role: string;
  menuOpen: boolean; setMenuOpen: (value: boolean) => void;
}) {
  return (
    <div className="dock-foot">
      <div className="dock-user">
        <button
          className={`profilebtn dock-profile${open ? '' : ' dock-avatar'}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label="account menu"
        >
          <Blobatar name={name} size={open ? 22 : 34} animate="hover" />
          {open && <span>{name}</span>}
          {open && <ChevronDownIcon size={12} />}
        </button>
      </div>
      {menuOpen && <UserMenu name={name} role={role} onClose={() => setMenuOpen(false)} />}
      {open && <div className="dock-bell"><Bell /></div>}
    </div>
  );
}

/** Reserve the dock's gutter in the content column. The dock is position:fixed
 *  so it no longer pushes .main over; --dock-pad does that instead, and the
 *  CSS transition on .layout animates it alongside the spring. */
function useDockPad(mode: DockMode) {
  useEffect(() => {
    const pad = mode === 'open' ? 248 : 94;
    document.documentElement.style.setProperty('--dock-pad', `${pad}px`);
    return () => document.documentElement.style.setProperty('--dock-pad', '0px');
  }, [mode]);
}

const SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const;

/** Panel geometry per state — all numbers so springs interpolate cleanly. */
const GEOM = {
  dock: { left: 14, top: 14, bottom: 14, width: 68, radius: 18 },
  open: { left: 0, top: 0, bottom: 0, width: 236, radius: 0 },
} as const;

/** Phone-only entry point to the full-height navigation drawer. */
function MobileNavTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="dock-mobile-trigger" onClick={onOpen} aria-label="open navigation">
      <Icon name="menu" size={18} />
    </button>
  );
}

function DockBackdrop({ onClose }: { onClose: () => void }) {
  return <div className="dock-backdrop" onClick={onClose} aria-hidden />;
}

export function Sidebar({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<DockMode>('dock');
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

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

  // `[` and shift+D both toggle dock <-> open; there is no hidden state.
  const toggle = useCallback(() => {
    setMode((was) => {
      const next: DockMode = was === 'open' ? 'dock' : 'open';
      writeMode(next);
      return next;
    });
  }, []);

  // Click anywhere outside the dock closes the user popup (dock mode has no
  // backdrop to catch it).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      const aside = document.querySelector('.dock');
      if (aside && !aside.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onToggle = () => toggle();
    const onShow = () => setDockMode('open');
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
    window.addEventListener(DOCK_SHOW_EVENT, onShow);
    return () => {
      window.removeEventListener(SIDEBAR_TOGGLE_EVENT, onToggle);
      window.removeEventListener(DOCK_SHOW_EVENT, onShow);
    };
  }, [toggle, setDockMode]);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('machina.sidebar.groups', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const groups = GROUPS.filter((group) => !group.admin || role === 'admin');
  const open = mode === 'open';
  const geom = GEOM[mode];

  useDockPad(mode);

  return (
    <>
      {!open && <MobileNavTrigger onOpen={() => setDockMode('open')} />}
      <motion.aside
        className={`dock${open ? ' open' : ''}${menuOpen ? ' menu-open' : ''}`}
        initial={false}
        animate={{
          left: geom.left,
          top: geom.top,
          bottom: geom.bottom,
          width: geom.width,
          borderRadius: geom.radius,
        }}
        transition={SPRING}
      >
        <div className="dock-head">
          <Link href="/home" className="dock-brand" aria-label="machina home">machina</Link>
          <button
            className="dock-collapse"
            onClick={toggle}
            aria-label={open ? 'collapse to dock' : 'expand sidebar'}
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

        <DockFoot open={open} name={name} role={role} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      </motion.aside>

      {open && <DockBackdrop onClose={() => { setMenuOpen(false); setDockMode('dock'); }} />}
    </>
  );
}
