/**
 * Docker inventory for the admin console.
 *
 * The v1 platform drove Docker through dockerode on a socket mount. This is a
 * CLI wrapper instead: the app already runs on the host as an unprivileged
 * user with `docker` on PATH, so the socket path never has to be mounted into
 * anything. Arguments are passed as an array and never through a shell, and a
 * container is addressed by its validated id or name only.
 *
 * Scope is the read plane, lifecycle, plus a deliberately narrow create/remove.
 * Create takes no bind mounts, no volumes, no privileged flag, no host network,
 * no capabilities and no devices — a web form that can hand out host filesystem
 * access is a root shell with a text box. Remove only touches containers this
 * page created, identified by their own label.
 */

import { run } from './exec';

/** Same shape docker-create enforces; duplicated rather than imported because
 *  docker-create already imports statCache helpers from this module. */
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;

export type Container = {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead' | string;
  status: string;
  health: string | null;
  ports: string;
  project: string | null;
  service: string | null;
  createdAt: string;
  cpuPct: number | null;
  memMb: number | null;
  memLimitMb: number | null;
  memPct: number | null;
  pids: number | null;
  /** True only for containers this console created (label machina.managed=1). */
  managed: boolean;
};

/** docker ps emits one JSON object per line; the field names are docker's. */
type PsRow = {
  ID: string; Names: string; Image: string; State: string; Status: string;
  HealthStatus?: string; Ports: string; CreatedAt: string;
  Labels?: string; Mounts?: string; Networks?: string;
};
type StatRow = { Name: string; CPUPerc: string; MemUsage: string; MemPerc: string; PIDs: string };

const ID_RE = /^[a-f0-9]{12,64}$/;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;

/** Docker accepts a full id, a unique prefix or a name. Anything else is a
 *  programmer error, so it is rejected here rather than shelled at. */
export function validRef(ref: string): boolean {
  return ID_RE.test(ref) || NAME_RE.test(ref);
}

function label(labels: string | undefined, key: string): string | null {
  if (!labels) return null;
  const hit = labels.split(',').find((entry) => entry.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : null;
}

function parseNumber(text: string | undefined): number | null {
  if (!text) return null;
  const value = Number.parseFloat(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function megabytes(text: string | undefined): number | null {
  if (!text) return null;
  const match = /([\d.]+)\s*([KMGT]?i?B)/i.exec(text);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const mult = unit.startsWith('k') ? 1 / 1024
    : unit.startsWith('g') ? 1024
    : unit.startsWith('t') ? 1024 * 1024
    : 1;
  return Math.round(value * mult);
}

/** docker stats costs a daemon round trip per container and blocks for ~1s on
 *  a cold cgroup. Cache it so a page refresh loop cannot turn into a load
 *  generator on someone's NAS. */
let statCache: { at: number; rows: Map<string, StatRow> } = { at: 0, rows: new Map() };

async function stats(): Promise<Map<string, StatRow>> {
  if (Date.now() - statCache.at < 8000) return statCache.rows;
  const rows = new Map<string, StatRow>();
  try {
    const out = await run('docker', ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 20_000 });
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const statRow = JSON.parse(line) as StatRow;
      rows.set(statRow.Name, statRow);
    }
  } catch {
    // A stopped daemon or a very large host is not an error worth failing the
    // page over: the inventory still renders, just without live numbers.
  }
  statCache = { at: Date.now(), rows };
  return rows;
}

/** State changed somewhere else (create/remove/action) — drop the stats cache. */
export function bustStatCache(): void {
  statCache.at = 0;
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

/** docker reports the literal "none" for a container that defines no
 *  healthcheck, and "" when it has never run one. Neither means healthy, so
 *  both collapse to null and the UI says nothing. */
function healthOf(health: string | undefined): string | null {
  if (!health || health === 'none') return null;
  return health;
}

function pidsOf(statRow: StatRow | undefined): number | null {
  if (!statRow) return null;
  const pidCount = Number(statRow.PIDs);
  return Number.isFinite(pidCount) ? pidCount : null;
}

/** Memory sample pair. 0B/0B means "no sample yet", not "uses no memory". */
function memPair(statRow: StatRow | undefined): { used: number | null; limit: number | null } {
  if (!statRow) return { used: null, limit: null };
  return { used: megabytes(statRow.MemUsage.split('/')[0]), limit: megabytes(statRow.MemUsage.split('/')[1]) };
}

/** One `docker ps` row plus its stats sample, as the console's shape. */
function toContainer(psRow: PsRow, statRow: StatRow | undefined): Container {
  const { used, limit } = memPair(statRow);
  return {
    id: psRow.ID,
    name: psRow.Names,
    image: psRow.Image,
    state: psRow.State,
    status: psRow.Status,
    health: healthOf(psRow.HealthStatus),
    ports: psRow.Ports ?? '',
    project: label(psRow.Labels, 'com.docker.compose.project'),
    service: label(psRow.Labels, 'com.docker.compose.service'),
    createdAt: psRow.CreatedAt,
    cpuPct: statRow ? parseNumber(statRow.CPUPerc) : null,
    memMb: used && limit ? used : null,
    memLimitMb: limit || null,
    memPct: limit ? parseNumber(statRow?.MemPerc ?? '') : null,
    pids: pidsOf(statRow),
    managed: label(psRow.Labels, 'machina.managed') === '1',
  };
}

export async function listContainers(): Promise<Container[]> {
  const out = await run('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}'], { timeout: 20_000 });
  const rows: PsRow[] = out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as PsRow);
  const live = await stats();
  return rows
    .map((psRow) => toContainer(psRow, live.get(psRow.Names)))
    .sort((left, right) => (left.project ?? '~').localeCompare(right.project ?? '~') || left.name.localeCompare(right.name));
}

// ------------------------------------------------------------------ actions

// Lifecycle verbs the console offers live in ACTIONS above (with 'kill').

const ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause', 'kill'] as const;
export type ContainerAction = (typeof ACTIONS)[number];

export function isAction(action: unknown): action is ContainerAction {
  return typeof action === 'string' && (ACTIONS as readonly string[]).includes(action);
}

export async function containerAction(ref: string, action: ContainerAction): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  // 'docker stop' without a timeout hangs for 10s on a container that ignores
  // SIGTERM; 10s is the platform default, so say it out loud instead.
  const args = action === 'stop' ? ['stop', '--time', '10', ref] : [action, ref];
  const out = await run('docker', args, { timeout: 30_000 });
  statCache.at = 0; // state changed, live numbers are stale
  return out.trim() || ref;
}

/** docker rename is non-disruptive — it changes the name, not the process. */
export async function renameContainer(ref: string, name: string): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  if (!CONTAINER_NAME.test(name)) throw new Error('name: 1-63 chars, letters, digits, dot, dash, underscore');
  const out = await run('docker', ['rename', ref, name], { timeout: 15_000 });
  return out.trim() || name;
}

export async function containerLogs(ref: string, tail = 200): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  const boundedTail = Math.min(2000, Math.max(10, Math.trunc(tail)));
  try {
    // stdout+stderr are separated by docker into two files; --timestamps keeps
    // them ordered when they are stitched back together.
    return await run('docker', ['logs', '--timestamps', '--tail', String(boundedTail), ref], { timeout: 20_000 });
  } catch (caught) {
    // docker exits non-zero for some containers whose log driver is not json
    // or whose stream rotated; the message still carries the reason.
    throw new Error((caught as Error).message);
  }
}

