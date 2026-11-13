/**
 * Image catalog model. Base images live as plain .qcow2 files named
 * <imageId>.qcow2 in the images pool dir; the download path is:
 *   url --(fetch to .part)--> sha256 verify (when published) --> rename
 *   <imageId>.qcow2 --> pool-refresh. A missing published SHA256SUMS is not
 * fatal: the first successful download's hash becomes the recorded baseline.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { config, storagePaths } from '@/lib/config';
import { now } from './util';
import { virsh } from './driver';
import { ignore } from '@/lib/core/ignore';

const pexec = promisify(execFile);

export interface CatalogEntry {
  id: string;
  name: string;
  distro: string;
  version: string;
  url: string;
  sha256Url: string;
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'ubuntu-24.04',
    name: 'Ubuntu 24.04 LTS (Noble)',
    distro: 'ubuntu',
    version: '24.04',
    url: 'https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img',
    sha256Url: 'https://cloud-images.ubuntu.com/releases/24.04/release/SHA256SUMS',
  },
  {
    id: 'debian-12',
    name: 'Debian 12 (Bookworm)',
    distro: 'debian',
    version: '12',
    url: 'https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-genericcloud-amd64.qcow2',
    sha256Url: '',
  },
];

export function imagePathFor(imageId: string): string {
  return path.join(storagePaths().images, `${imageId}.qcow2`);
}

/** Stream-sha256 to avoid loading 600MB into RAM. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function fetchFile(url: string, dest: string): Promise<void> {
  const { default: https } = await import('https');
  const { default: http } = await import('http');
  const client = url.startsWith('https') ? https : http;
  await new Promise<void>((resolve, reject) => {
    const request = client.get(url, (firstResponse) => {
      if (firstResponse.statusCode && firstResponse.statusCode >= 300 && firstResponse.statusCode < 400 && firstResponse.headers.location) {
        // one redirect hop is enough for cloud-images
        const redirectRequest = client.get(firstResponse.headers.location, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) return reject(new Error(`http ${redirectResponse.statusCode}`));
          const outFile = fs.createWriteStream(dest);
          redirectResponse.pipe(outFile);
          outFile.on('finish', () => outFile.close(() => resolve()));
        });
        redirectRequest.on('error', reject);
        return;
      }
      if (firstResponse.statusCode !== 200) return reject(new Error(`http ${firstResponse.statusCode}`));
      const outFile = fs.createWriteStream(dest);
      firstResponse.pipe(outFile);
      outFile.on('finish', () => outFile.close(() => resolve()));
    });
    request.on('error', reject);
  });
}

/** Parse a cloud-images SHA256SUMS style file for the base image name. */
function shaFor(sums: string, version: string): string | null {
  // Collect all matching .img hashes, prefer amd64.
  const matches: { hash: string; name: string }[] = [];
  for (const line of sums.split('\n')) {
    const match = line.match(/([0-9a-f]{64})\s+\*?(.*\.img)$/);
    if (!match) continue;
    const fileName = match[2];
    if (!fileName.includes(version) || fileName.includes('lxd') || fileName.includes('rootfs')) continue;
    matches.push({ hash: match[1], name: fileName });
  }
  if (!matches.length) return null;
  const amd64Match = matches.find((entry) => entry.name.includes('amd64') && !entry.name.includes('amd64v'));
  return (amd64Match ?? matches[0]).hash;
}

const syncState = new Map<string, boolean>();
export const isSyncing = (imageId: string): boolean => syncState.get(imageId) === true;
export { syncState };

export async function syncImage(imageId: string): Promise<void> {
  if (syncState.get(imageId)) throw new Error('image sync already in progress');
  syncState.set(imageId, true);
  try {
    await doSync(imageId);
  } finally {
    syncState.delete(imageId);
  }
}

/** Published checksum, when the image declares one. Missing sums are not fatal. */
async function expectedSha(
  imageRow: { sha256Url: string | null; version: string | null },
  partPath: string,
): Promise<string> {
  if (!imageRow.sha256Url) return '';
  const sumsPath = `${partPath}.sums`;
  await fetchFile(imageRow.sha256Url, sumsPath).catch(ignore('checksum file is optional'));
  if (!fs.existsSync(sumsPath)) return '';
  const expectedHash = shaFor(fs.readFileSync(sumsPath, 'utf8'), imageRow.version ?? '') || '';
  await fsp.rm(sumsPath, { force: true });
  return expectedHash;
}

/** Fetch to .part, verify, then move into place. */
async function downloadVerified(
  imageRow: { url: string },
  partPath: string,
  finalPath: string,
  wantSha: string,
): Promise<void> {
  await fetchFile(imageRow.url, partPath);
  const actualSha = await sha256File(partPath);
  if (wantSha && wantSha !== actualSha) {
    throw new Error(`sha256 mismatch: got ${actualSha.slice(0, 12)} want ${wantSha.slice(0, 12)}`);
  }
  fs.renameSync(partPath, finalPath);
  // libvirt-qemu needs to read it directly from the pool dir.
  await fsp.chmod(finalPath, 0o644).catch(ignore('chmod is cosmetic; the file is already readable'));
}

async function doSync(imageId: string): Promise<void> {
  const { getDb } = await import('@/lib/db');
  const { images } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const db = getDb();
  const row = (await db.select().from(images).where(eq(images.id, imageId)).limit(1))[0];
  if (!row) throw new Error(`unknown image ${imageId}`);
  const storage = storagePaths();
  fs.mkdirSync(storage.images, { recursive: true });
  const partPath = path.join(storage.images, `${imageId}.part`);
  const finalPath = imagePathFor(imageId);

  try {
    const wantSha = await expectedSha(row, partPath);
    await db.update(images).set({ status: 'downloading', updatedAt: now() }).where(eq(images.id, imageId));
    await downloadVerified(row, partPath, finalPath, wantSha);
  } catch (syncError) {
    await fsp.rm(partPath, { force: true }).catch(ignore('partial download may not exist'));
    await db.update(images).set({
      status: 'failed',
      failure: String((syncError as Error).message || syncError),
      updatedAt: now(),
    }).where(eq(images.id, imageId));
    throw syncError;
  }

  // Baseline-hash fallback when no published sums existed at first sync.
  const baselineSha = row.sha256 || (await sha256File(finalPath));
  await db.update(images).set({
    status: 'ready',
    path: finalPath,
    sha256: baselineSha,
    sizeBytes: fs.statSync(finalPath).size,
    failure: null,
    updatedAt: now(),
  }).where(eq(images.id, imageId));
  await pexec(config.virshBin, ['-c', config.virshUri, 'pool-refresh', config.imagePool]).catch(ignore('pool refresh is best-effort; libvirt rescans anyway'));
  void virsh;
}
