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
      managed: label(r.Labels, 'machina.managed') === '1',
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

// ---------------------------------------------------------------- create/remove

/**
 * Image references are restricted to registries we can name, and the tag must
 * be explicit. `:latest` is refused because a container that silently changes
 * what it runs on the next pull is not something an admin can audit.
 */
const REGISTRIES = ['docker.io', 'ghcr.io', 'quay.io', 'lscr.io', 'registry.k8s.io', 'gcr.io', 'mcr.microsoft.com'];
const IMAGE_RE = /^(?:([a-z0-9.-]+\.[a-z]{2,})\/)?([a-z0-9][a-z0-9._/-]{0,150}):([A-Za-z0-9_][A-Za-z0-9._-]{0,127})$/;
const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;

export type CreateSpec = {
  name: string;
  image: string;
  memoryMb?: number;
  cpus?: number;
  ports?: { host: number; container: number }[];
};

/** Validated and normalised. Anything not on this list never reaches argv. */
export function parseCreate(body: Record<string, unknown>): CreateSpec {
  const name = String(body.name ?? '').trim();
  if (!CONTAINER_NAME.test(name)) {
    throw new Error('name: 1-63 chars, letters, digits, dot, dash, underscore');
  }
  const image = String(body.image ?? '').trim();
  const m = IMAGE_RE.exec(image);
  if (!m) throw new Error('image must be a registry path with an explicit tag (e.g. ghcr.io/org/app:1.2.3)');
  const registry = m[1] ?? 'docker.io';
  if (!REGISTRIES.includes(registry)) throw new Error(`registry ${registry} is not allowed`);
  if (m[3] === 'latest' || m[3] === 'main' || m[3] === 'master') {
    throw new Error('pin a real version tag — latest/main would change under you on the next pull');
  }

  const memoryMb = body.memoryMb == null ? 512 : Math.trunc(Number(body.memoryMb));
  if (!Number.isFinite(memoryMb) || memoryMb < 128 || memoryMb > 8192) {
    throw new Error('memory must be 128-8192 MB');
  }
  const cpus = body.cpus == null ? 1 : Number(body.cpus);
  if (!Number.isFinite(cpus) || cpus <= 0 || cpus > 8) throw new Error('cpus must be greater than 0 and at most 8');

  const rawPorts = Array.isArray(body.ports) ? body.ports : [];
  if (rawPorts.length > 8) throw new Error('at most 8 published ports');
  const seen = new Set<number>();
  const ports = rawPorts.map((p) => {
    const host = Math.trunc(Number((p as { host?: unknown }).host));
    const cont = Math.trunc(Number((p as { container?: unknown }).container));
    if (!Number.isInteger(host) || host < 1024 || host > 65535) throw new Error('host port must be 1024-65535');
    if (!Number.isInteger(cont) || cont < 1 || cont > 65535) throw new Error('container port must be 1-65535');
    if (seen.has(host)) throw new Error(`host port ${host} is listed twice`);
    seen.add(host);
    return { host, container: cont };
  });

  return { name, image, memoryMb, cpus, ports };
}

export async function createContainer(spec: CreateSpec): Promise<string> {
  // Refuse name collisions before Docker gets a chance to silently replace or
  // conflict with an unrelated service.
  const existing = await run('docker', ['ps', '-a', '--filter', `name=^/${spec.name}$`, '--format', '{{.Names}}'], { timeout: 10_000 });
  if (existing.split('\n').some((n) => n.trim() === spec.name)) throw new Error('a container with that name already exists');
  const args = [
    'run', '-d',
    '--name', spec.name,
    '--label', 'machina.managed=1',
    '--memory', `${spec.memoryMb}m`,
    '--pids-limit', '256',
    // no auto-restart loop on a container that crashes on boot
    '--restart', 'unless-stopped',
  ];
  if (spec.cpus) args.push('--cpus', String(spec.cpus));
  for (const p of spec.ports ?? []) args.push('-p', `${p.host}:${p.container}`);
  args.push(spec.image);
  const out = await run('docker', args, { timeout: 300_000 });
  statCache.at = 0;
  return out.trim().slice(0, 64) || spec.name;
}

export async function removeContainer(ref: string): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  // The label is the entire authorisation: without it this call would delete
  // any container on the host, including the platform's own dependencies.
  const label = await run(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "machina.managed"}}', ref],
    { timeout: 10_000 },
  );
  if (label.trim() !== '1') throw new Error('refusing to remove: this container was not created by machina');
  const out = await run('docker', ['rm', ref], { timeout: 60_000 });
  statCache.at = 0;
  return out.trim() || ref;
}
