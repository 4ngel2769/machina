'use client';

import { ThinkingOrb, type OrbState, type OrbSize } from 'thinking-orbs';

/* ---------------------------------------------------------------- skeletons */

/** Shimmering placeholder block. `w`/`h` in px, or any CSS length. */
export function Skeleton({ w = '100%', h = 12, r = 6, style }: { w?: string | number; h?: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkelCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card">
      <Skeleton w="55%" h={14} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={`${90 - i * 18}%`} h={10} style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export function SkelRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="skelrow">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} h={10} w={`${100 / cols - 4}%`} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- orbs */

/** Semantic state -> orb state. Deliberately NOT one loader for everything:
 *  a booting VM, a downloading image and a connecting terminal should not
 *  look identical. */
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

/** The house orb loader. */
export function Orb({ state = 'working', size = 20, label }: { state?: string; size?: OrbSize; label?: string }) {
  return <ThinkingOrb state={(ORB_FOR[state] ?? 'working') as OrbState} size={size} theme="dark" aria-label={label ?? state} />;
}

/* --------------------------------------------------------------- spinners */

/** Thin conic ring — for actions inside buttons where an orb is too heavy. */
export function Ring({ size = 14 }: { size?: number }) {
  return <span className="ring" style={{ width: size, height: size }} aria-hidden />;
}

/** Three-dot wave. */
export function Dots() {
  return (
    <span className="dots" aria-hidden>
      <i /><i /><i />
    </span>
  );
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

/** One consistent empty state everywhere: orb, line, optional action. */
export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-orb"><Orb state="breathing" size={32} /></div>
      <div className="empty-text">{text}</div>
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}
