/**
 * Docker admin plane: inspect, live stats, image inventory and the process
 * spawner the WS relays use. Split from docker.ts (inventory + lifecycle)
 * for the file-size lint cap.
 *
 * inspectContainer redacts env values by default — names and lengths only —
 * because a detail page is not where secrets belong. Pass revealEnv only
 * from a route that has already decided the caller may see them.
 */

import { spawn } from 'child_process';
import { run } from './exec';
import { validRef, bustStatCache } from './docker';
import { parseImage } from './docker-create';

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

// ------------------------------------------------------------------ inspect

/** The subset of `docker inspect` the detail page renders. Config.Env is
 *  deliberately dropped: it is where secrets live and a detail page is not
 *  the place to leak them. */
export type ContainerDetail = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  restartCount: number;
  restartPolicy: string;
  pid: number | null;
  entrypoint: string[];
  command: string[];
  workingDir: string;
  user: string;
  env: { name: string; value: string; len: number }[];
  mounts: { type: string; source: string; destination: string; rw: boolean }[];
  networkMode: string;
  networks: string[];
  ports: { private: number; public: number | null; type: string }[];
  platform: string;
};

type InspectConfig = {
  Entrypoint?: string[] | null; Cmd?: string[] | null; WorkingDir?: string;
  User?: string; Env?: string[]; ExposedPorts?: Record<string, unknown>;
  Labels?: Record<string, string>; Healthcheck?: { Test?: string[] };
};
type InspectState = {
  Status?: string; Running?: boolean; Paused?: boolean; Restarting?: boolean;
  OOMKilled?: boolean; Dead?: boolean; Pid?: number; StartedAt?: string;
  FinishedAt?: string; Health?: { Status?: string };
};
type InspectHost = { NetworkMode?: string };
type InspectNet = { Networks?: Record<string, { IPAddress?: string }> };
type InspectMount = { Type?: string; Source?: string; Destination?: string; RW?: boolean };
type InspectPort = { IP?: string; PrivatePort?: number; PublicPort?: number; Type?: string };
type InspectRow = {
  Id?: string; Name?: string; Config?: InspectConfig; Image?: string;
  State?: InspectState; HostConfig?: { RestartPolicy?: { Name?: string }; PortBindings?: Record<string, InspectPort[]>; Binds?: string[]; NetworkMode?: string };
  Mounts?: InspectMount[]; NetworkSettings?: InspectNet & { Ports?: Record<string, InspectPort[] | null> };
  Platform?: string; Os?: string; Created?: string; Path?: string; Args?: string[];
  RestartCount?: number;
};

function envPairs(rawEnv: string[] | undefined): { name: string; value: string; len: number }[] {
  // Values are masked: the detail page shows names and lengths, never secrets.
  return (rawEnv ?? []).map((entry) => {
    const eq = entry.indexOf('=');
    if (eq === -1) return { name: entry, value: '', len: 0 };
    const value = entry.slice(eq + 1);
    return { name: entry.slice(0, eq), value: '•'.repeat(Math.min(value.length, 12)), len: value.length };
  });
}

function portList(row: InspectRow): ContainerDetail['ports'] {
  const ports: ContainerDetail['ports'] = [];
  const seen = new Set<string>();
  const push = (key: string, binds: InspectPort[] | null | undefined) => {
    const privatePort = Number(key.split('/')[0]);
    const type = key.split('/')[1] ?? 'tcp';
    if (!binds?.length) {
      const dedupe = `${privatePort}:${type}:exposed`;
      if (!seen.has(dedupe)) { seen.add(dedupe); ports.push({ private: privatePort, public: null, type }); }
      return;
    }
    for (const bind of binds) {
      const dedupe = `${privatePort}:${bind.PublicPort ?? ''}:${type}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      ports.push({ private: privatePort, public: bind.PublicPort ?? null, type });
    }
  };
  for (const [key, binds] of Object.entries(row.HostConfig?.PortBindings ?? {})) push(key, binds);
  for (const [key, binds] of Object.entries(row.NetworkSettings?.Ports ?? {})) push(key, binds);
  return ports.sort((a, b) => a.private - b.private || (a.public ?? 0) - (b.public ?? 0));
}

function stateOf(state: InspectState | undefined): string {
  if (!state) return 'unknown';
  if (state.Dead) return 'dead';
  if (state.Restarting) return 'restarting';
  if (state.Paused) return 'paused';
  if (state.Running) return 'running';
  return 'exited';
}

/** docker inspect is one JSON document; only the fields the page shows. */
function timestamps(state: InspectState | undefined): { startedAt: string | null; finishedAt: string | null } {
  const zero = '0001-01-01T00:00:00Z';
  return {
    startedAt: state?.StartedAt && state.StartedAt !== zero ? state.StartedAt : null,
    finishedAt: state?.FinishedAt && state.FinishedAt !== zero ? state.FinishedAt : null,
  };
}

function mountList(mounts: InspectMount[] | undefined): ContainerDetail['mounts'] {
  return (mounts ?? []).map((m) => ({
    type: m.Type ?? '', source: m.Source ?? '',
    destination: m.Destination ?? '', rw: m.RW !== false,
  }));
}

/** hostConfig fields, one line each — keeps each mapper under the lint cap. */
function hostFields(first: InspectRow, detail: ContainerDetail): void {
  detail.restartPolicy = first.HostConfig?.RestartPolicy?.Name || 'no';
  detail.networkMode = first.HostConfig?.NetworkMode ?? '';
}

function stateFields(first: InspectRow, detail: ContainerDetail): void {
  const state = first.State;
  detail.state = stateOf(state);
  detail.status = state?.Status ?? '';
  detail.health = state?.Health?.Status ?? null;
  detail.pid = state?.Pid || null;
  detail.restartCount = first.RestartCount ?? 0;
  const { startedAt, finishedAt } = timestamps(state);
  detail.startedAt = startedAt;
  detail.finishedAt = finishedAt;
}

function configFields(first: InspectRow, detail: ContainerDetail): void {
  const config = first.Config;
  detail.entrypoint = config?.Entrypoint ?? [];
  detail.command = config?.Cmd ?? [];
  detail.workingDir = config?.WorkingDir ?? '';
  detail.user = config?.User ?? '';
  detail.env = envPairs(config?.Env);
  detail.mounts = mountList(first.Mounts);
}

function networkFields(first: InspectRow, detail: ContainerDetail): void {
  detail.networks = Object.keys(first.NetworkSettings?.Networks ?? {});
  detail.ports = portList(first);
  detail.platform = first.Os ?? first.Platform ?? '';
}

/** One `docker inspect` document -> the detail page's shape. */
export async function inspectContainer(ref: string): Promise<ContainerDetail> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  const out = await run('docker', ['inspect', ref], { timeout: 15_000 });
  const first = (JSON.parse(out) as InspectRow[])[0];
  if (!first) throw new Error('container not found');
  const detail: ContainerDetail = {
    id: (first.Id ?? '').slice(0, 12),
    name: (first.Name ?? '').replace(/^\//, ''),
    image: first.Image || '',
    state: '', status: '', health: null,
    startedAt: null, finishedAt: null, restartCount: 0, restartPolicy: '',
    pid: null, entrypoint: [], command: [], workingDir: '', user: '',
    env: [], mounts: [], networkMode: '', networks: [], ports: [], platform: '',
  };
  hostFields(first, detail);
  stateFields(first, detail);
  configFields(first, detail);
  networkFields(first, detail);
  return detail;
}

// -------------------------------------------------------------------- stats

export type ContainerStats = {
  cpuPct: number | null;
  memMb: number | null;
  memLimitMb: number | null;
  memPct: number | null;
  netRxMb: number | null;
  netTxMb: number | null;
  blockReadMb: number | null;
  blockWriteMb: number | null;
  pids: number | null;
};

/** `docker stats --no-stream` for one container, parsed into numbers. */
export async function containerStats(ref: string): Promise<ContainerStats> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  const out = await run(
    'docker',
    ['stats', '--no-stream', '--format', '{{json .}}', ref],
    { timeout: 25_000 },
  );
  const line = out.split('\n').find((row) => row.trim());
  if (!line) throw new Error('no stats for container');
  const statRow = JSON.parse(line) as {
    CPUPerc?: string; MemUsage?: string; MemPerc?: string; NetIO?: string;
    BlockIO?: string; PIDs?: string;
  };
  const memParts = (statRow.MemUsage ?? '').split('/');
  const netParts = (statRow.NetIO ?? '').split('/');
  const blockParts = (statRow.BlockIO ?? '').split('/');
  return {
    cpuPct: parseNumber(statRow.CPUPerc),
    memMb: megabytes(memParts[0]),
    memLimitMb: megabytes(memParts[1]),
    memPct: parseNumber(statRow.MemPerc),
    netRxMb: megabytes(netParts[0]),
    netTxMb: megabytes(netParts[1]),
    blockReadMb: megabytes(blockParts[0]),
    blockWriteMb: megabytes(blockParts[1]),
    pids: Number.isFinite(Number(statRow.PIDs)) ? Number(statRow.PIDs) : null,
  };
}

// ------------------------------------------------------------- live streams

/** Spawn a docker process with piped stdio; the WS relay owns its lifecycle.
 *  stdio is [stdin, stdout, stderr] — stderr is merged into stdout because a
 *  TUI cannot tell the difference anyway. */
export function streamDocker(
  args: string[],
  handlers: {
    onData: (chunk: Buffer) => void;
    onExit: (code: number | null) => void;
    onError: (message: string) => void;
  },
): { stdin: import('stream').Writable | null; kill: () => void } {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.on('data', handlers.onData);
  child.stderr.on('data', handlers.onData);
  child.on('error', (spawnError) => handlers.onError(spawnError.message));
  child.on('close', (code) => handlers.onExit(code));
  return {
    stdin: child.stdin,
    kill: () => { try { child.kill('SIGTERM'); } catch { /* already gone */ } },
  };
}

