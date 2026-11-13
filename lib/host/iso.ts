/**
 * Installer media.
 *
 * Upload and attach are one feature, not two: an uploaded ISO nobody can attach
 * is a disk leak, and attaching one that had to be copied by hand is not a
 * feature. Both live here so the size cap, the name allowlist and the
 * "is it in use" check are in exactly one place.
 *
 * Ownership lives in the iso_uploads table, not the filesystem: every file in
 * the library has exactly one owner, and a user's list is their uploads only.
 * Files that predate the registry (or were dropped in by hand) are owned by
 * nobody — visible to admins, invisible to tenants.
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { Readable } from 'stream';
import { storagePaths } from '@/lib/config';
import { rawDb } from '@/lib/db';
import { virsh } from '@/lib/core/driver';
import { ignore } from '@/lib/core/ignore';
import { isoLimits } from '@/lib/host/iso-limits';
import { now } from '@/lib/core/util';

export type Iso = { name: string; sizeMb: number; sizeBytes?: number; mtime: number; sha256: string | null; ownerId: string | null };

/** A name reaches both a filesystem path and an argv slot. Allowlist, not a filter. */
const ISO_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.iso$/i;

function assertIsoName(name: string): string {
  if (!ISO_NAME.test(name) || name.includes('..')) {
    throw new Error('iso name must be a plain filename ending in .iso (letters, digits, dot, dash, underscore)');
  }
  return name;
}

export async function isoDir(): Promise<string> {
  const dir = storagePaths().iso;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function isoPath(name: string): Promise<string> {
  assertIsoName(name);
  return path.join(await isoDir(), name);
}

function ownersByName(): Map<string, string> {
  const rows = rawDb().prepare(`select name, owner_id from iso_uploads`).all() as
    { name: string; owner_id: string }[];
  return new Map(rows.map((row) => [row.name, row.owner_id]));
}

/** The library, optionally scoped to one owner. Admins pass no userId and see
 *  everything; a tenant's list is their own uploads only. */
export async function listIsos(userId?: string | null): Promise<Iso[]> {
  const dir = await isoDir();
  const owners = ownersByName();
  const out: Iso[] = [];
  for (const file of await fs.readdir(dir)) {
    if (!/\.iso$/i.test(file)) continue;
    const stat = await fs.stat(path.join(dir, file)).catch(() => null);
    if (!stat?.isFile()) continue;
    const ownerId = owners.get(file) ?? null;
    // Tenants see their own uploads plus the unowned admin shelf; admins see all.
    if (userId && ownerId !== null && ownerId !== userId) continue;
    // The checksum is written once at upload; recomputing it on every list
    // would hash gigabytes per page view.
    const sha = await fs.readFile(path.join(dir, `${file}.sha256`), 'utf8')
      .then((contents) => contents.trim().slice(0, 64)).catch(() => null);
    out.push({ name: file, sizeMb: Math.round(stat.size / 1048576), mtime: Math.round(stat.mtimeMs), sha256: sha, ownerId });
  }
  return out.sort((left, right) => left.name.localeCompare(right.name));
}

/** Registry row for an upload, written after the file lands. */
function registerIso(name: string, ownerId: string, sizeBytes: number): void {
  rawDb().prepare(
    `insert into iso_uploads (name, owner_id, size_bytes, created_at) values (?,?,?,?)
     on conflict(name) do update set owner_id=excluded.owner_id, size_bytes=excluded.size_bytes`,
  ).run(name, ownerId, sizeBytes, now());
}

function unregisterIso(name: string): void {
  rawDb().prepare(`delete from iso_uploads where name=?`).run(name);
}

/** The owner's ISO count and combined size, for quota display. */
export function isoUsageFor(userId: string): { count: number; totalBytes: number } {
  const row = rawDb()
    .prepare(`select count(*) as n, coalesce(sum(size_bytes),0) as bytes from iso_uploads where owner_id=?`)
    .get(userId) as { n: number; bytes: number };
  return { count: row.n ?? 0, totalBytes: row.bytes ?? 0 };
}

/**
 * Stream a request body to disk. Never buffered: a multi-GB installer read into
 * memory would take the process down, and the cap is enforced while writing so
 * an oversized upload is aborted rather than stored and then rejected.
 * `ownerId` is the uploading user; null means an admin shelf upload with no
 * tenant owner (still visible to admins only).
 */
export async function saveIso(
  rawName: string,
  body: ReadableStream<Uint8Array> | null,
  ownerId: string | null = null,
): Promise<Iso> {
  const name = assertIsoName(rawName);
  if (!body) throw new Error('empty request body');

  const dir = await isoDir();
  const limits = isoLimits();
  const maxBytes = limits.maxIsoGb * 1024 ** 3;
  const tempFile = path.join(dir, `.upload-${crypto.randomUUID()}.part`);
  const final = path.join(dir, name);
  const hash = crypto.createHash('sha256');
  const ws = createWriteStream(tempFile, { mode: 0o640 });
  let size = 0;

  try {
    for await (const chunk of Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])) {
      const buf = Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > maxBytes) throw new Error(`iso exceeds the ${limits.maxIsoGb} GB upload cap`);
      hash.update(buf);
      if (!ws.write(buf)) await new Promise<void>((res) => ws.once('drain', () => res()));
    }
    await new Promise<void>((resolve, reject) => {
      ws.once('finish', () => resolve());
      ws.once('error', reject);
      ws.end();
    });
  } catch (caught) {
    ws.destroy();
    await fs.rm(tempFile, { force: true }).catch(ignore('temp file may not exist'));
    throw caught;
  }

  const sha256 = hash.digest('hex');
  // Same directory, so the rename is atomic: a half-written ISO can never
  // appear under the name a domain would attach.
  await fs.rename(tempFile, final);
  await fs.writeFile(`${final}.sha256`, `${sha256}\n`, { mode: 0o640 });
  if (ownerId) registerIso(name, ownerId, size);

  return { name, sizeMb: Math.round(size / 1048576), sizeBytes: size, mtime: Date.now(), sha256, ownerId };
}

/** Domains whose stored config points at this ISO. */
export async function isoUsers(name: string): Promise<string[]> {
  const target = await isoPath(name);
  const names = (await virsh(['list', '--all', '--name']))
    .split('\n').map((line) => line.trim()).filter(Boolean);
  const used: string[] = [];
  for (const domain of names) {
    const xml = await virsh(['dumpxml', '--inactive', domain]).catch(() => '');
    if (xml.includes(target)) used.push(domain);
  }
  return used;
}

/** Owner check for tenant deletes; admins bypass via caller. */
export function isoOwner(name: string): string | null {
  const row = rawDb().prepare(`select owner_id from iso_uploads where name=?`).get(assertIsoName(name)) as
    { owner_id: string } | undefined;
  return row?.owner_id ?? null;
}

export async function deleteIso(name: string): Promise<string> {
  const used = await isoUsers(name);
  if (used.length) throw new Error(`attached to ${used.join(', ')} — detach it there first`);
  const file = await isoPath(name);
  await fs.rm(file, { force: true });
  await fs.rm(`${file}.sha256`, { force: true });
  unregisterIso(name);
  return `${name} deleted`;
}
