/** Shapes for the instance detail page. */

export type Inst = {
  id: string; name: string; status: string; ip: string; mac: string;
  imageId: string; planId: string; rootPassword?: string;
  planName?: { name: string; vcpu: number; ramMb: number; diskGb: number } | null;
  autoSuspended: number; rateHourlyCents: number; createdAt: number;
  bw?: { month: string; rxBytes: number; txBytes: number; quotaGb: number; throttled: boolean };
  step?: string;
  problem?: string | null;
  healCount?: number;
  logLines?: { t: number; m: string; kind: 'step' | 'ok' | 'err' | 'info' }[];
};

export type Job = { id: string; type: string; status: string; error: string; createdAt: number };
export type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export const TABS = ['term', 'vnc', 'metrics', 'snapshots', 'schedule', 'info', 'logs'] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABEL: Record<Tab, string> = {
  term: 'terminal', vnc: 'console (VNC)', metrics: 'metrics',
  snapshots: 'snapshots', schedule: 'schedule', info: 'information', logs: 'activity',
};

export function fmtGb(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
}

export function instanceIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.split('/')[2] ?? '';
}
