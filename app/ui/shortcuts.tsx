'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const GO: Record<string, string> = {
  h: '/home', i: '/instances', k: '/keys', b: '/billing', s: '/specs', a: '/admin',
};
const LABEL: Record<string, string> = {
  h: 'home', i: 'instances', k: 'ssh keys', b: 'billing', s: 'specs', a: 'admin',
};

/**
 * Keyboard navigation, vim-style. `g` then a key jumps; `?` toggles the
 * cheat-sheet; `/` focuses search when one exists; Esc closes things.
 * Ignored while typing in a field — a shortcut that eats keystrokes inside a
 * password box is worse than no shortcut.
 */
export function Shortcuts() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onKey = useCallback((e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === 'Escape') { setShow(false); setPending(false); return; }
    if (typing) return;

    if (e.key === '?') { e.preventDefault(); setShow((v) => !v); return; }
    if (e.key === '/') {
      const s = document.querySelector<HTMLInputElement>('input[data-search]');
      if (s) { e.preventDefault(); s.focus(); }
      return;
    }
    if (e.key === 'g' || e.key === 'G') {
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPending(false), 1200);
      return;
    }
    if (pending) {
      const dest = GO[e.key.toLowerCase()];
      if (dest) { e.preventDefault(); setPending(false); router.push(dest); }
    }
  }, [pending, router]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (timer.current) clearTimeout(timer.current); };
  }, [onKey]);

  return (
    <>
      {pending && (
        <div style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 60 }} className="shortcutbar">
          <span>g</span><span style={{ opacity: .6 }}>then</span>
          {Object.entries(LABEL).map(([k, v]) => (
            <span key={k}><kbd>{k}</kbd> {v}</span>
          ))}
        </div>
      )}
      <div style={{ position: 'fixed', bottom: 14, right: 16, zIndex: 40 }} className="shortcutbar">
        <span><kbd>?</kbd> shortcuts</span>
      </div>
      {show && (
        <div
          onClick={() => setShow(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%' }}>
            <h3 style={{ marginBottom: 14 }}>keyboard shortcuts</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13, alignItems: 'center' }}>
              <span><kbd>g</kbd> <kbd>h</kbd></span><span className="muted">go home</span>
              <span><kbd>g</kbd> <kbd>i</kbd></span><span className="muted">go instances</span>
              <span><kbd>g</kbd> <kbd>k</kbd></span><span className="muted">go ssh keys</span>
              <span><kbd>g</kbd> <kbd>b</kbd></span><span className="muted">go billing</span>
              <span><kbd>g</kbd> <kbd>s</kbd></span><span className="muted">go specs</span>
              <span><kbd>g</kbd> <kbd>a</kbd></span><span className="muted">go admin</span>
              <span><kbd>/</kbd></span><span className="muted">focus search</span>
              <span><kbd>Esc</kbd></span><span className="muted">close anything</span>
              <span><kbd>?</kbd></span><span className="muted">toggle this panel</span>
            </div>
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Link href="/home" style={{ fontSize: 12, color: 'var(--text-3)' }}>close</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
