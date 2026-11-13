/** Shapes for the container detail page. Mirrors lib/host/docker-admin types. */

export type ContainerDetail = {
  id: string; name: string; image: string; state: string; status: string;
  health: string | null; startedAt: string | null; finishedAt: string | null;
  restartCount: number; restartPolicy: string; pid: number | null;
  entrypoint: string[]; command: string[]; workingDir: string; user: string;
  env: { name: string; value: string; len: number }[];
  mounts: { type: string; source: string; destination: string; rw: boolean }[];
  networkMode: string; networks: string[];
  ports: { private: number; public: number | null; type: string }[];
  platform: string;
};

export type ContainerStats = {
  cpuPct: number | null; memMb: number | null; memLimitMb: number | null;
  memPct: number | null; netRxMb: number | null; netTxMb: number | null;
  blockReadMb: number | null; blockWriteMb: number | null; pids: number | null;
};

export const TABS = ['logs', 'console', 'stats', 'inspect'] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABEL: Record<Tab, string> = {
  logs: 'logs', console: 'console', stats: 'stats', inspect: 'inspect',
};

export function containerIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  // /containers/<id> — the id is URL-encoded because docker names can carry
  // characters the router would otherwise split on.
  const segment = window.location.pathname.split('/')[2] ?? '';
  try { return decodeURIComponent(segment); } catch { return segment; }
}
