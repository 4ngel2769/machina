/**
 * Notification bell for the top nav: unread badge, polls the feed endpoint.
 * Clicking opens the notifications page; the badge clears as items are read.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellIcon } from './icons';

export function Bell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        if (!response.ok || !alive) return;
        const body = await response.json();
        if (alive) setUnread(typeof body.unread === 'number' ? body.unread : 0);
      } catch { /* badge is cosmetic — never surface poll errors */ }
    };
    void pull();
    const timer = setInterval(pull, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <Link
      href="/notifications"
      aria-label={unread ? `${unread} unread notifications` : 'notifications'}
      title="notifications"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, color: 'var(--text-2)', textDecoration: 'none', fontSize: 17 }}
    >
      <BellIcon size={18} />
      {unread > 0 && (
        <span
          aria-hidden
          style={{
            position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16,
            padding: '0 4px', borderRadius: 8, background: 'var(--danger)', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: '16px', textAlign: 'center',
          }}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}
