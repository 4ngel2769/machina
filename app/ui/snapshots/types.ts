/** Shapes and constants for the instance snapshot panel. */

export type Snap = {
  id: string;
  name: string;
  description: string;
  state: string;
  sizeBytes: number;
  current: boolean;
  createdAt: number;
  orphaned?: boolean;
};

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Names people reach for. A blank name is more likely to be a typo than a
 *  refusal, so offer the obvious ones rather than making them type. */
export const PRESETS = ['clean', 'before-upgrade', 'pre-deploy'];

export function fmtBytes(byteCount: number): string {
  if (!byteCount) return '—';
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 * 1024) return `${(byteCount / 1024).toFixed(0)} KB`;
  if (byteCount < 1024 ** 3) return `${(byteCount / 1024 / 1024).toFixed(1)} MB`;
  return `${(byteCount / 1024 ** 3).toFixed(2)} GB`;
}

export type DiskInfo = { actualBytes: number; freeMb: number };
export type ConfirmState = { snap: Snap; mode: 'clean' | 'live' };
