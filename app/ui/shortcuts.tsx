/**
 * Keyboard shortcut layer for the dashboard shell.
 *
 * `?` no longer owns a cheat-sheet of its own — it opens the command palette
 * with the shortcut list pinned, so there is exactly one "help me find a
 * thing" surface. Vim-style `g`-prefix navigation stays here.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { openPalette } from './palette';
import { toggleSidebar, showDock } from './sidebar';

const GO: Record<string, string> = {
  h: '/home', i: '/instances', k: '/keys', b: '/billing', s: '/specs', a: '/admin',
};
const LABEL: Record<string, string> = {
  h: 'home', i: 'instances', k: 'ssh keys', b: 'billing', s: 'specs', a: 'admin',
};

function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
}

function armGoTimer(timer: { current: ReturnType<typeof setTimeout> | null }, setPending: (value: boolean) => void) {
  setPending(true);
  if (timer.current) clearTimeout(timer.current);
  timer.current = setTimeout(() => setPending(false), 1200);
}

function focusSearch(event: KeyboardEvent) {
  const input = document.querySelector<HTMLInputElement>('input[data-search]');
  if (input) { event.preventDefault(); input.focus(); }
}

function followGo(event: KeyboardEvent, setPending: (value: boolean) => void, router: ReturnType<typeof useRouter>) {
  const dest = GO[event.key.toLowerCase()];
  if (dest) { event.preventDefault(); setPending(false); router.push(dest); }
}

/** Esc, ?, / and the g-prefix; returns true when the key was consumed. */
function specialKey(
  event: KeyboardEvent,
  setPending: React.Dispatch<React.SetStateAction<boolean>>,
  timer: { current: ReturnType<typeof setTimeout> | null },
): boolean {
  if (event.key === 'Escape') { setPending(false); return true; }
  if (event.key === '?') { event.preventDefault(); openPalette(true); return true; }
  if (event.key === '/') { focusSearch(event); return true; }
  if (event.key === '[') { event.preventDefault(); toggleSidebar(); return true; }
  if (event.key === 'D' && event.shiftKey) { event.preventDefault(); showDock(); return true; }
  if (event.key === 'g' || event.key === 'G') { armGoTimer(timer, setPending); return true; }
  return false;
}

/**
 * Keyboard navigation, vim-style. `g` then a key jumps; `?` opens the command
 * palette on its shortcuts view; `/` focuses search when one exists; Esc
 * clears the pending `g`. Ignored while typing in a field.
 */
export function Shortcuts() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onKey = useCallback((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event)) return;
    if (specialKey(event, setPending, timer)) return;
    if (pending) followGo(event, setPending, router);
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
          {Object.entries(LABEL).map(([key, label]) => (
            <span key={key}><kbd>{key}</kbd> {label}</span>
          ))}
        </div>
      )}
      <div style={{ position: 'fixed', bottom: 14, right: 16, zIndex: 40 }} className="shortcutbar">
        <button
          onClick={() => openPalette(true)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          aria-label="keyboard shortcuts"
        >
          <kbd>?</kbd> shortcuts
        </button>
      </div>
    </>
  );
}
