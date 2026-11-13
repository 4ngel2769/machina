/**
 * Installer media.
 *
 * Upload and attach are one feature, not two: an uploaded ISO nobody can attach
 * is a disk leak, and attaching one that had to be copied by hand is not a
 * feature. Both live here so the size cap, the name allowlist and the
 * "is it in use" check are in exactly one place.
 */

import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import crypto from 'crypto';
import path from 'path';
import { Readable } from 'stream';
import { storagePaths, config } from '@/lib/config';
import { virsh } from '@/lib/core/driver';

export type Iso = { name: string; sizeMb: number; mtime: number; sha256: string | null };

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

export async function listIsos(): Promise<Iso[]> {
  const dir = await isoDir();
  const out: Iso[] = [];
  for (const file of await fs.readdir(dir)) {
    if (!/\.iso$/i.test(file)) continue;
    const stat = await fs.stat(path.join(dir, file)).catch(() => null);
    if (!stat?.isFile()) continue;
    // The checksum is written once at upload; recomputing it on every list
    // would hash gigabytes per page view.
    const sha = await fs.readFile(path.join(dir, `${file}.sha256`), 'utf8')
      .then((contents) => contents.trim().slice(0, 64)).catch(() => null);
    out.push({ name: file, sizeMb: Math.round(stat.size / 1048576), mtime: Math.round(stat.mtimeMs), sha256: sha });
  }
  return out.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Stream a request body to disk. Never buffered: a multi-GB installer read into
 * memory would take the process down, and the cap is enforced while writing so
 * an oversized upload is aborted rather than stored and then rejected.
 */
export async function saveIso(
  rawName: string,
  body: ReadableStream<Uint8Array> | null,
): Promise<Iso> {
  const name = assertIsoName(rawName);
  if (!body) throw new Error('empty request body');

  const dir = await isoDir();
  const maxBytes = config.limits.maxIsoGb * 1024 ** 3;
  const tempFile = path.join(dir, `.upload-${crypto.randomUUID()}.part`);
  const final = path.join(dir, name);
  const hash = crypto.createHash('sha256');
  const ws = createWriteStream(tempFile, { mode: 0o640 });
  let size = 0;

  try {
    for await (const chunk of Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])) {
      const buf = Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > maxBytes) throw new Error(`iso exceeds the ${config.limits.maxIsoGb} GB upload cap`);
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
    await fs.rm(tempFile, { force: true }).catch(() => {});
    throw caught;
  }

  const sha256 = hash.digest('hex');
  // Same directory, so the rename is atomic: a half-written ISO can never
  // appear under the name a domain would attach.
  await fs.rename(tempFile, final);
  await fs.writeFile(`${final}.sha256`, `${sha256}\n`, { mode: 0o640 });

  return { name, sizeMb: Math.round(size / 1048576), mtime: Date.now(), sha256 };
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

export async function deleteIso(name: string): Promise<string> {
  const used = await isoUsers(name);
  if (used.length) throw new Error(`attached to ${used.join(', ')} — detach it there first`);
  const file = await isoPath(name);
  await fs.rm(file, { force: true });
  await fs.rm(`${file}.sha256`, { force: true });
  return `${name} deleted`;
}
