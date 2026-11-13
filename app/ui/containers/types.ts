/** Shapes and pure helpers for the Docker tab of the admin console. */

export type Container = {
  id: string; name: string; image: string; state: string; status: string;
  health: string | null; ports: string; project: string | null; service: string | null;
  createdAt: string; cpuPct: number | null; memMb: number | null; memLimitMb: number | null;
  memPct: number | null; pids: number | null; managed: boolean;
};
export type Payload = { available: boolean; containers: Container[]; error: string | null };

export const FILTERS = ['all', 'running', 'unhealthy', 'stopped'] as const;
export type Filter = (typeof FILTERS)[number];

/** Badge tone for the row: health first, then the docker state. */
export function badge(c: Container): string {
  if (c.health === 'unhealthy') return 'error';
  if (c.state === 'running') return c.health === 'starting' ? 'queued' : 'running';
  if (c.state === 'restarting') return 'provisioning';
  if (c.state === 'paused') return 'suspended';
  return 'stopped';
}

export function match(c: Container, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'unhealthy') return c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead';
  if (f === 'running') return c.state === 'running';
  return c.state !== 'running';
}

/** True when the container is in a state worth an operator's attention. */
export function needsAttention(c: Container): boolean {
  return c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'dead';
}

/** Containers grouped by compose project, sorted by project name. */
export function groupByProject(cs: Container[]): [string, Container[]][] {
  const m = new Map<string, Container[]>();
  for (const c of cs) {
    const k = c.project ?? '(standalone)';
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
