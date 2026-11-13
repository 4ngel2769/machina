/**
 * In-app notification feed: warnings, errors, confirmations. Unread items
 * sort first by recency; each links to the instance/request it concerns.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton } from '@/app/ui/loaders';

type Notification = {
  id: string; kind: 'info' | 'ok' | 'warn' | 'error';
  title: string; body: string; link: string | null;
  readAt: number | null; createdAt: number;
};

const KIND_ICON: Record<Notification['kind'], string> = {
  info: 'ℹ', ok: '✓', warn: '!', error: '✕',
};
const KIND_COLOR: Record<Notification['kind'], string> = {
  info: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--danger)',
};

function ago(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function NotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = useCallback(async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      setItems(body.items);
    } else toast.err('could not load notifications');
  }, [toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (op: string, id?: string) => {
    const response = await fetch('/api/notifications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, id }),
    });
    if (!response.ok) { toast.err('action failed'); return; }
    void load();
  };

  const shown = (items ?? []).filter((item) => filter === 'all' || item.readAt === null);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ marginBottom: 0 }}>notifications</h1>
        <div className="spacer" />
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all', 'unread'] as const).map((mode) => (
            <button key={mode} className={filter === mode ? 'primary' : ''} onClick={() => setFilter(mode)}>{mode}</button>
          ))}
          <button onClick={() => void act('read-all')}>mark all read</button>
        </div>
      </div>
      <div className="sub">{items ? `${items.filter((item) => item.readAt === null).length} unread` : 'loading…'}</div>

      {!items && <Skeleton h={160} />}
      {items && shown.length === 0 && <Empty text={filter === 'unread' ? 'nothing unread — all caught up' : 'no notifications yet'} />}

      {shown.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((item) => {
            const unread = item.readAt === null;
            const inner = (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span aria-hidden style={{ color: KIND_COLOR[item.kind], fontSize: 14, width: 16, textAlign: 'center', marginTop: 1, flex: 'none' }}>
                  {KIND_ICON[item.kind]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: unread ? 600 : 400 }}>{item.title}</div>
                  {item.body && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{item.body}</div>}
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{ago(item.createdAt)}</div>
                </div>
                {unread && <span className="jobdot run" aria-label="unread" />}
              </div>
            );
            return (
              <div key={item.id} className="card" style={{ padding: '12px 16px', margin: 0, opacity: unread ? 1 : 0.65 }}>
                {item.link ? <Link href={item.link} onClick={() => { if (unread) void act('read', item.id); }}>{inner}</Link> : inner}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
