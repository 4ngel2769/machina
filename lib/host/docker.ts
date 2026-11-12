import { run } from './exec';

/**
 * Docker inventory for the admin console.
 *
 * The v1 platform drove Docker through dockerode on a socket mount. This is a
 * CLI wrapper instead: the app already runs on the host as an unprivileged
 * user with `docker` on PATH, so the socket path never has to be mounted into
 * anything. Arguments are passed as an array and never through a shell, and a
 * container is addressed by its validated id or name only.
 *
 * Scope is deliberately the read plane plus start/stop/restart. Creating and
 * removing containers from a web page is a different risk class (image
 * provenance, volume ownership, port publishing) and nothing here needs it.
 */

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
  const hit = labels.split(',').find((l) => l.startsWith(`${key}=`));
  return hit ? hit.slice(key.length + 1) : null;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function mb(s: string | undefined): number | null {
  if (!s) return null;
  const m = /([\d.]+)\s*([KMGT]?i?B)/i.exec(s);
  if (!m) return null;
  const v = Number.parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('k') ? 1 / 1024
    : unit.startsWith('g') ? 1024
    : unit.startsWith('t') ? 1024 * 1024
    : 1;
  return Math.round(v * mult);
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
      const r = JSON.parse(line) as StatRow;
      rows.set(r.Name, r);
    }
  } catch {
    // A stopped daemon or a very large host is not an error worth failing the
    // page over: the inventory still renders, just without live numbers.
  }
  statCache = { at: Date.now(), rows };
  return rows;
}

export async function dockerAvailable(): Promise<boolean> {
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export async function listContainers(): Promise<Container[]> {
  const out = await run('docker', ['ps', '-a', '--no-trunc', '--format', '{{json .}}'], { timeout: 20_000 });
  const rows: PsRow[] = out.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as PsRow);
  const live = await stats();
  return rows.map((r) => {
    const s = live.get(r.Names);
    const mem = s ? mb(s.MemUsage.split('/')[0]) : null;
    const limit = s ? mb(s.MemUsage.split('/')[1]) : null;
    return {
      id: r.ID,
      name: r.Names,
      image: r.Image,
      state: r.State,
      status: r.Status,
      // docker reports the literal string "none" for a container that defines
      // no healthcheck, and "" when it has never run one. Neither means healthy,
      // so both collapse to null and the UI says nothing.
      health: r.HealthStatus && r.HealthStatus !== 'none' && r.HealthStatus !== '' ? r.HealthStatus : null,
      ports: r.Ports ?? '',
      project: label(r.Labels, 'com.docker.compose.project'),
      service: label(r.Labels, 'com.docker.compose.service'),
      createdAt: r.CreatedAt,
      cpuPct: s ? num(s.CPUPerc) : null,
      // a container that just (re)started reports 0B/0B, which is not "it uses
      // no memory", it is "no sample yet".
      memMb: mem && limit ? mem : null,
      memLimitMb: limit || null,
      memPct: limit ? num(s?.MemPerc ?? '') : null,
      pids: s && Number.isFinite(Number(s.PIDs)) ? Number(s.PIDs) : null,
    };
  }).sort((a, b) => (a.project ?? '~').localeCompare(b.project ?? '~') || a.name.localeCompare(b.name));
}

const ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'] as const;
export type ContainerAction = (typeof ACTIONS)[number];

export function isAction(a: unknown): a is ContainerAction {
  return typeof a === 'string' && (ACTIONS as readonly string[]).includes(a);
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

export async function containerLogs(ref: string, tail = 200): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  const n = Math.min(2000, Math.max(10, Math.trunc(tail)));
  try {
    // stdout+stderr are separated by docker into two files; --timestamps keeps
    // them ordered when they are stitched back together.
    return await run('docker', ['logs', '--timestamps', '--tail', String(n), ref], { timeout: 20_000 });
  } catch (e) {
    // docker exits non-zero for some containers whose log driver is not json
    // or whose stream rotated; the message still carries the reason.
    throw new Error((e as Error).message);
  }
}
