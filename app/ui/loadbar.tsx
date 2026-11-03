'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Thin gradient progress bar pinned under the top nav. Fires on route
 * changes and on loadStart/loadEnd() guards around long fetches.
 * The gradient fades to transparent on both ends so the track has no edges.
 */

let guards = 0;
const listeners = new Set<(on: boolean) => void>();

/** Call before starting a long async action. */
export function loadStart() {
  guards += 1;
  listeners.forEach((l) => l(true));
}

/** Call when the action settles. */
export function loadEnd() {
  guards = Math.max(0, guards - 1);
  if (guards === 0) {
    setTimeout(() => { if (guards === 0) listeners.forEach((l) => l(false)); }, 350);
  }
}

export function LoadBar() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = () => {
      setOn(true);
      if (hide.current) clearTimeout(hide.current);
    };
    const release = () => {
      hide.current = setTimeout(() => setOn(false), 200);
    };
    // route change
    show();
    hide.current = setTimeout(() => setOn(false), 700);
    // action guards
    listeners.add(show);
    listeners.add(release);
    return () => { listeners.delete(show); listeners.delete(release); };
  }, [pathname]);

  return (
    <div className={`loadbar ${on ? 'on' : ''}`} aria-hidden={!on}>
      <div className="loadbar-fill" />
    </div>
  );
}
