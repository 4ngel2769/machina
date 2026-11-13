/**
 * Loading primitives: ASCII skeletons, thinking orbs, rings and bars.
 */
'use client';

import { AsciiSkeleton } from 'ascii-reveal';
import { useEffect, useState } from 'react';
import { ThinkingOrb, type OrbState, type OrbSize } from 'thinking-orbs';
import { Icon, type IconName } from './icons';

/* ---------------------------------------------------------------- skeletons */

function skeletonShape({ w, h, lines }: { w: string | number; h: number; lines?: number }) {
  if (lines && lines > 1) {
    return {
      lines,
      widths: Array.from({ length: lines }, (_, i) => `${100 - (i % 3) * 14}%`),
      animate: lines <= 6,
      style: { display: 'block' as const },
    };
  }
  return {
    rows: Math.max(1, Math.round(h / 12)),
    width: w,
    height: h,
    animate: true,
    style: { display: 'block' as const },
  };
}

/** ASCII placeholder block. `w`/`h` in px or CSS lengths; `lines` picks a
 *  multi-line text shape. Blocks shimmer; long multi-line lists stay still. */
export function Skeleton({ w = '100%', h = 12, r = 6, style, lines }: {
  w?: string | number;
  h?: number;
  r?: number;
  style?: React.CSSProperties;
  lines?: number;
}) {
  void r;
  const shape = skeletonShape({ w, h, lines });
  return <AsciiSkeleton variant="scan" {...shape} style={{ ...shape.style, ...style }} />;
}

export function SkelCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card">
      <Skeleton w="55%" h={14} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} w={`${90 - index * 18}%`} h={10} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function SkelRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="skelrow">
      {Array.from({ length: cols }).map((_, index) => (
        <Skeleton key={index} h={10} w={`${100 / cols - 4}%`} />
      ))}
    </div>
  );
}

/** Content gate: stays false for `ms` after mount, so a fast fetch doesn't
 *  swap a skeleton for real content in a single frame. Pair with the data
 *  check: `{!ready && <Skeleton/>}{ready && data && …}`. */
export function useMinVisible(ms = 400): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return ready;
}

/* ------------------------------------------------------------------- orbs */

/** Semantic state -> orb animation. */
export const ORB_FOR: Record<string, OrbState> = {
  provisioning: 'weaving',
  'instance.create': 'weaving',
  'instance.start': 'connecting',
  'instance.stop': 'solving',
  'instance.delete': 'solving',
  // snapshots: writing one is shaping (building a copy), rolling back and
  // deleting are solving (undoing something).
  'instance.snapshot': 'shaping',
  'instance.snapshot-revert': 'solving',
  'instance.snapshot-delete': 'solving',
  downloading: 'searching',
  'image.sync': 'searching',
  syncing: 'searching',
  queued: 'composing',
  waiting: 'listening',
  connecting: 'connecting',
  searching: 'searching',
  solving: 'solving',
  working: 'working',
  shaping: 'shaping',
  breathing: 'breathing',
};

export function Orb({ state = 'working', size = 20, label }: { state?: string; size?: OrbSize; label?: string }) {
  return <ThinkingOrb state={(ORB_FOR[state] ?? 'working') as OrbState} size={size} theme="dark" aria-label={label ?? state} />;
}

export function Ring({ size = 14 }: { size?: number }) {
  return <span className="ring" style={{ width: size, height: size }} aria-hidden />;
}

export function Dots() {
  return <span className="dots" aria-hidden><i /><i /><i /></span>;
}

/** Indeterminate progress bar. */
export function BarLoader({ label }: { label?: string }) {
  return (
    <div className="barloader" role="status" aria-label={label ?? 'loading'}>
      <div className="barloader-fill" />
    </div>
  );
}

/* ------------------------------------------------------------ empty states */

/** One consistent empty state everywhere: a static monochrome icon, a line,
 *  and an optional action. The icon should say *what* is empty. */
export function Empty({ text, action, icon = 'inbox' }: {
  text: string;
  action?: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <div className="empty-text">{text}</div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
