/** Shapes and pure helpers for the Docker tab of the admin console. */

export type Container = {
  id: string; name: string; image: string; state: string; status: string;
  health: string | null; ports: string; project: string | null; service: string | null;
  createdAt: string; cpuPct: number | null; memMb: number | null; memLimitMb: number | null;
  memPct: number | null; pids: number | null; managed: boolean;
  ownerId?: string | null; ownerName?: string | null; netName?: string | null;
};
export type Payload = { available: boolean; containers: Container[]; error: string | null };

export const FILTERS = ['all', 'running', 'unhealthy', 'stopped'] as const;
export type Filter = (typeof FILTERS)[number];

/** Badge tone for the row: health first, then the docker state. */
export function badge(container: Container): string {
  if (container.health === 'unhealthy') return 'error';
  if (container.state === 'running') return container.health === 'starting' ? 'queued' : 'running';
  if (container.state === 'restarting') return 'provisioning';
  if (container.state === 'paused') return 'suspended';
  return 'stopped';
}

export function match(container: Container, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unhealthy') return container.health === 'unhealthy' || container.state === 'restarting' || container.state === 'dead';
  if (filter === 'running') return container.state === 'running';
  return container.state !== 'running';
}

/** True when the container is in a state worth an operator's attention. */
export function needsAttention(container: Container): boolean {
  return container.health === 'unhealthy' || container.state === 'restarting' || container.state === 'dead';
}

/** Containers grouped by compose project, sorted by project name. */
export function groupByProject(containers: Container[]): [string, Container[]][] {
  const groups = new Map<string, Container[]>();
  for (const container of containers) {
    const key = container.project ?? '(standalone)';
    groups.set(key, [...(groups.get(key) ?? []), container]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}
