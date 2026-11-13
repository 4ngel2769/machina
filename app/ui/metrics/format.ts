/** Shapes and formatting for the instance metrics panel. */

export type Point = { t: number; cpu: number; read: number; write: number };
export type Payload = {
  ok: boolean;
  points: Point[];
  allocBytes: number;
  ncpu: number;
  ramAllocMb: number;
  ramObservable: boolean;
  running: boolean;
};

export const RANGES = [
  { k: '1h', label: '1 hour' },
  { k: '6h', label: '6 hours' },
  { k: '24h', label: '24 hours' },
  { k: '7d', label: '7 days' },
] as const;

export function fmtBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtRate(bps: number): string {
  return bps > 1024 ** 2 ? `${(bps / 1024 ** 2).toFixed(1)} MB/s` : `${(bps / 1024).toFixed(0)} KB/s`;
}

export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
