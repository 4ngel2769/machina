'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ctrl/Cmd-K command palette.
 *
 * Navigation only. It does not act on anything: a palette that can delete a VM
 * from a fuzzy-matched keystroke is how people delete the wrong VM. Shortcuts.tsx
 * owns the vim bindings and deliberately ignores modifier keys, so the two do
 * not fight over Cmd-K.
 */

type Dest = { label: string; href: string; group: string; admin?: boolean };

const DESTS: Dest[] = [
  { label: 'home', href: '/home', group: 'go' },
  { label: 'instances', href: '/instances', group: 'go' },
  { label: 'ssh keys', href: '/keys', group: 'go' },
  { label: 'billing', href: '/billing', group: 'go' },
  { label: 'specs', href: '/specs', group: 'go' },
  { label: 'account', href: '/account', group: 'go' },
  { label: 'admin', href: '/admin', group: 'admin', admin: true },
  { label: 'host console', href: '/host', group: 'admin', admin: true },
  { label: 'containers', href: '/containers', group: 'admin', admin: true },
  { label: 'terms', href: '/terms', group: 'legal' },
  { label: 'privacy', href: '/privacy', group: 'legal' },
];

export function Palette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dests = useMemo(
    () => DESTS.filter((d) => !d.admin || role === 'admin'),
    [role],
  );
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return dests;
    return dests.filter((d) => d.label.includes(needle) || d.group.includes(needle));
  }, [dests, q]);

  const close = useCallback(() => { setOpen(false); setQ(''); setSel(0); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) { e.preventDefault(); close(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  const go = (href: string) => { close(); router.push(href); };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[sel];
      if (hit) go(hit.href);
    }
  };

  return (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 20px 20px' }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', padding: 0, overflow: 'hidden' }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="jump to…"
          aria-label="command palette"
          style={{ width: '100%', border: 0, borderRadius: 0, padding: '14px 16px', fontSize: 15, background: 'transparent' }}
        />
        <div style={{ borderTop: '1px solid var(--line)' }} />
        {hits.length === 0 && <div className="muted" style={{ padding: '14px 16px' }}>nothing matches</div>}
        {hits.map((d, i) => (
          <button
            key={d.href}
            onMouseEnter={() => setSel(i)}
            onClick={() => go(d.href)}
            style={{
              display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
              padding: '10px 16px', borderRadius: 0, border: 0,
              background: i === sel ? 'var(--surface-2, #17171a)' : 'transparent',
            }}
          >
            <span>{d.label}</span>
            <span className="muted mono" style={{ fontSize: 11 }}>{d.href}</span>
          </button>
        ))}
        <div className="muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 11 }}>
          ↑ ↓ to move · enter to open · esc to close · ctrl/cmd-k toggles
        </div>
      </div>
    </div>
  );
}
