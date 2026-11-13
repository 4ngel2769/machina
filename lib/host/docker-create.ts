/**
 * Container create/remove for the admin console.
 *
 * Split from docker.ts for the file-size lint cap; the parsing rules are the
 * security boundary — anything not on these lists never reaches argv. Create
 * takes no bind mounts, no volumes, no privileged flag, no host network, no
 * capabilities and no devices; remove only touches containers this page
 * created, identified by their own label.
 */

import { run } from './exec';
import { ignore } from '@/lib/core/ignore';
import { validRef, bustStatCache } from './docker';

const REGISTRIES = ['docker.io', 'ghcr.io', 'quay.io', 'lscr.io', 'registry.k8s.io', 'gcr.io', 'mcr.microsoft.com'];
const IMAGE_RE = /^(?:([a-z0-9.-]+\.[a-z]{2,})\/)?([a-z0-9][a-z0-9._/-]{0,150}):([A-Za-z0-9_][A-Za-z0-9._-]{0,127})$/;
export const CONTAINER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;

/** Registry path with an explicit, immutable tag, or a message saying why not. */
export function parseImage(image: string): string {
  const match = IMAGE_RE.exec(image);
  if (!match) throw new Error('image must be a registry path with an explicit tag (e.g. ghcr.io/org/app:1.2.3)');
  const registry = match[1] ?? 'docker.io';
  if (!REGISTRIES.includes(registry)) throw new Error(`registry ${registry} is not allowed`);
  if (match[3] === 'latest' || match[3] === 'main' || match[3] === 'master') {
    throw new Error('pin a real version tag — latest/main would change under you on the next pull');
  }
  return image;
}

export type CreateSpec = {
  name: string;
  image: string;
  memoryMb?: number;
  cpus?: number;
  ports?: { host: number; container: number }[];
  /** Docker network to join. 'bridge' = shared default; 'user' = the
   *  caller's private machina-cu<idx> bridge. */
  network?: 'bridge' | 'user';
  /** Tenant owner for machina.user containers; admins pass null. */
  ownerId?: string | null;
  /** Human-readable owner name for the admin table. */
  ownerName?: string | null;
};

function parsePorts(rawPorts: unknown[]): { host: number; container: number }[] {
  if (rawPorts.length > 8) throw new Error('at most 8 published ports');
  const seen = new Set<number>();
  const ports: { host: number; container: number }[] = [];
  for (const portPair of rawPorts) {
    const host = Math.trunc(Number((portPair as { host?: unknown }).host));
    const cont = Math.trunc(Number((portPair as { container?: unknown }).container));
    if (!Number.isInteger(host) || host < 1024 || host > 65535) throw new Error('host port must be 1024-65535');
    if (!Number.isInteger(cont) || cont < 1 || cont > 65535) throw new Error('container port must be 1-65535');
    if (seen.has(host)) throw new Error(`host port ${host} is listed twice`);
    seen.add(host);
    ports.push({ host, container: cont });
  }
  return ports;
}

/** Truncated whole number in [min, max], defaulting when absent. */
function intField(v: unknown, def: number, min: number, max: number, message: string): number {
  const value = v == null ? def : Math.trunc(Number(v));
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(message);
  return value;
}

/** Number in (0, max], defaulting when absent. */
function positiveField(v: unknown, def: number, max: number, message: string): number {
  const value = v == null ? def : Number(v);
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(message);
  return value;
}

/** Validated and normalised. Anything not on this list never reaches argv. */
export function parseCreate(body: Record<string, unknown>): CreateSpec {
  const name = String(body.name ?? '').trim();
  if (!CONTAINER_NAME.test(name)) {
    throw new Error('name: 1-63 chars, letters, digits, dot, dash, underscore');
  }
  const image = parseImage(String(body.image ?? '').trim());
  const memoryMb = intField(body.memoryMb, 512, 128, 8192, 'memory must be 128-8192 MB');
  const cpus = positiveField(body.cpus, 1, 8, 'cpus must be greater than 0 and at most 8');
  const rawPorts = Array.isArray(body.ports) ? body.ports : [];
  const network = body.network === 'user' ? 'user' : 'bridge';
  return { name, image, memoryMb, cpus, ports: parsePorts(rawPorts), network };
}

/** Which docker network a create lands on: the owner's private bridge for
 *  tenant containers, the shared default otherwise. */
async function networkFor(spec: CreateSpec): Promise<string> {
  if (spec.network !== 'user' || !spec.ownerId) return 'bridge';
  const { ensureUserDockernet } = await import('@/lib/core/userdockernet');
  const net = await ensureUserDockernet(spec.ownerId);
  return net.name;
}

/** docker run argv for one create. Every conditional piece of spec lands here
 *  so createContainer itself stays a straight line. */
function runArgs(spec: CreateSpec, netName: string): string[] {
  const args = [
    'run', '-d',
    '--name', spec.name,
    '--label', 'machina.managed=1',
    '--label', `machina.network=${netName}`,
    '--memory', `${spec.memoryMb}m`,
    '--pids-limit', '256',
    // no auto-restart loop on a container that crashes on boot
    '--restart', 'unless-stopped',
    '--network', netName,
  ];
  if (spec.cpus) args.push('--cpus', String(spec.cpus));
  if (spec.ownerId) {
    args.push('--label', `machina.owner=${spec.ownerId}`);
    if (spec.ownerName) args.push('--label', `machina.owner_name=${spec.ownerName.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64)}`);
  }
  // Tenant containers never publish host ports — the private bridge is the
  // only way in, and only from the host itself.
  if (spec.network !== 'user') {
    for (const port of spec.ports ?? []) args.push('-p', `${port.host}:${port.container}`);
  }
  args.push(spec.image);
  return args;
}

/** Registry row: quota accounting and the "who owns it" answer both read
 *  this table, not docker inspect. */
async function registerContainer(id: string, spec: CreateSpec, netName: string): Promise<void> {
  if (!spec.ownerId) return;
  const { rawDb } = await import('@/lib/db');
  rawDb().prepare(
    `insert into user_containers (id, user_id, name, net_name, memory_mb, cpus, created_at)
     values (?,?,?,?,?,?,?)
     on conflict(id) do update set name=excluded.name, net_name=excluded.net_name`,
  ).run(id, spec.ownerId, spec.name, netName === 'bridge' ? null : netName, spec.memoryMb ?? 0, spec.cpus ?? 0, Date.now());
}

export async function createContainer(spec: CreateSpec): Promise<string> {
  // Refuse name collisions before Docker gets a chance to silently replace or
  // conflict with an unrelated service.
  const existing = await run('docker', ['ps', '-a', '--filter', `name=^/${spec.name}$`, '--format', '{{.Names}}'], { timeout: 10_000 });
  if (existing.split('\n').some((nameLine) => nameLine.trim() === spec.name)) throw new Error('a container with that name already exists');

  const netName = await networkFor(spec);
  const out = await run('docker', runArgs(spec, netName), { timeout: 300_000 });
  bustStatCache();

  const id = out.trim().slice(0, 64) || spec.name;
  await registerContainer(id, spec, netName);
  return id;
}

export async function removeContainer(ref: string): Promise<string> {
  if (!validRef(ref)) throw new Error('invalid container reference');
  // The label is the entire authorisation: without it this call would delete
  // any container on the host, including the platform's own dependencies.
  const managedLabel = await run(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "machina.managed"}}', ref],
    { timeout: 10_000 },
  );
  if (managedLabel.trim() !== '1') throw new Error('refusing to remove: this container was not created by machina');
  // Capture the registry row BEFORE rm: quota accounting and per-user
  // network cleanup both key off it.
  const ownerRow = await run(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "machina.owner"}}', ref],
    { timeout: 10_000 },
  ).catch(() => '');
  const ownerId = ownerRow.trim() || null;
  const out = await run('docker', ['rm', ref], { timeout: 60_000 });
  bustStatCache();
  if (ownerId) {
    const { rawDb } = await import('@/lib/db');
    const removedId = out.trim().slice(0, 64);
    rawDb().prepare(`delete from user_containers where id=? or name=?`).run(removedId, ref);
    const { maybeRemoveUserDockernet } = await import('@/lib/core/userdockernet');
    await maybeRemoveUserDockernet(ownerId).catch(ignore('net cleanup is best-effort'));
  }
  return out.trim() || ref;
}
