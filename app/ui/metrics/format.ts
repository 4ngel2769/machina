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
  { key: '1h', label: '1 hour' },
  { key: '6h', label: '6 hours' },
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
] as const;

export function fmtBytes(byteCount: number): string {
  if (!byteCount) return '—';
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 ** 2) return `${(byteCount / 1024).toFixed(0)} KB`;
  if (byteCount < 1024 ** 3) return `${(byteCount / 1024 ** 2).toFixed(1)} MB`;
  return `${(byteCount / 1024 ** 3).toFixed(2)} GB`;
}

export function fmtRate(bytesPerSec: number): string {
  return bytesPerSec > 1024 ** 2 ? `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s` : `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export const clock = (timestampMs: number) => new Date(timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
