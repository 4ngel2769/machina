/**
 * Phone navigation: a floating dock that opens a popover per nav group and
 * slides away while the page scrolls down. The desktop dock stays as it is;
 * this component is display:none above 860px.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Blobatar } from '@blobatar/react';
import 'blobatar/motion.css';
import { Icon } from '@/app/ui/icons';
import { isActive, groupHasActive, type NavGroup } from './nav';
import { UserMenu } from './user-menu';

type Props = { groups: NavGroup[]; pathname: string; name: string; role: string };

function DockPopup({ group, pathname, onPick }: {
  group: NavGroup; pathname: string; onPick: () => void;
}) {
  return (
    <div className="mobile-popup" role="dialog" aria-label={`${group.label} navigation`}>
      <div className="mobile-popup-title">{group.label}</div>
      <div className="mobile-popup-items">
        {group.items.map((item) => (
          <Link key={item.href} href={item.href} onClick={onPick}
            className={`mobile-popup-link${isActive(pathname, item.href) ? ' active' : ''}`}>
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DockBar({ groups, pathname, openGroup, accountOpen, name, onGroup, onAccount }: {
  groups: NavGroup[]; pathname: string; openGroup: string | null;
  accountOpen: boolean; name: string;
  onGroup: (id: string | null) => void; onAccount: (open: boolean) => void;
}) {
  return (
    <nav className="mobile-dock-bar" aria-label="mobile navigation">
      {groups.map((group) => (
        <button key={group.id} type="button"
          className={`mobile-dock-item${groupHasActive(pathname, group) ? ' active' : ''}${openGroup === group.id ? ' open' : ''}`}
          aria-expanded={openGroup === group.id} aria-label={group.label}
          onClick={() => onGroup(openGroup === group.id ? null : group.id)}>
          <Icon name={group.icon} size={19} />
          <span>{group.label}</span>
        </button>
      ))}
      <button type="button"
        className={`mobile-dock-item account${accountOpen ? ' open' : ''}`}
        aria-expanded={accountOpen} aria-label="account"
        onClick={() => onAccount(!accountOpen)}>
        <Blobatar name={name} size={22} animate="hover" />
        <span>account</span>
      </button>
    </nav>
  );
}

export function MobileDock({ groups, pathname, name, role }: Props) {
  const [hidden, setHidden] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const closeAll = () => { setOpenGroup(null); setAccountOpen(false); };
  const group = groups.find((candidate) => candidate.id === openGroup);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) < 6) return;
      const shouldHide = delta > 0 && y > 80;
      setHidden(shouldHide);
      if (shouldHide) closeAll();
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAll(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {(group || accountOpen) && <div className="mobile-dock-backdrop" onClick={closeAll} aria-hidden />}
      <div className={`mobiledock${hidden ? ' hidden' : ''}`}>
        {group && <DockPopup group={group} pathname={pathname} onPick={closeAll} />}
        {accountOpen && (
          <div className="mobile-popup mobile-account">
            <UserMenu name={name} role={role} onClose={closeAll} />
          </div>
        )}
        <DockBar
          groups={groups} pathname={pathname} openGroup={openGroup} accountOpen={accountOpen}
          name={name}
          onGroup={(id) => { setAccountOpen(false); setOpenGroup(id); }}
          onAccount={(open) => { setOpenGroup(null); setAccountOpen(open); }}
        />
      </div>
    </>
  );
}
