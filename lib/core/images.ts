import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { config, storagePaths } from '@/lib/config';
import { now } from './util';
import { virsh } from './driver';

const pexec = promisify(execFile);

/**
 * Image catalog model. Base images live as plain .qcow2 files named
 * <imageId>.qcow2 in the images pool dir; the download path is:
 *   url --(fetch to .part)--> sha256 verify (when published) --> rename
 *   <imageId>.qcow2 --> pool-refresh. A missing published SHA256SUMS is not
 * fatal: the first successful download's hash becomes the recorded baseline.
 */

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
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (d) => h.update(d));
    s.on('end', () => res(h.digest('hex')));
    s.on('error', rej);
  });
}

async function fetchFile(url: string, dest: string): Promise<void> {
  const { default: https } = await import('https');
  const { default: http } = await import('http');
  const client = url.startsWith('https') ? https : http;
  await new Promise<void>((res, rej) => {
    const get = client.get;
    const req = get(url, (r0) => {
      if (r0.statusCode && r0.statusCode >= 300 && r0.statusCode < 400 && r0.headers.location) {
        // one redirect hop is enough for cloud-images
        const req2 = get(r0.headers.location, (r2) => {
          if (r2.statusCode !== 200) return rej(new Error(`http ${r2.statusCode}`));
          const f = fs.createWriteStream(dest);
          r2.pipe(f);
          f.on('finish', () => f.close(() => res()));
        });
        req2.on('error', rej);
        return;
      }
      if (r0.statusCode !== 200) return rej(new Error(`http ${r0.statusCode}`));
      const f = fs.createWriteStream(dest);
      r0.pipe(f);
      f.on('finish', () => f.close(() => res()));
    });
    req.on('error', rej);
  });
}

/** Parse a cloud-images SHA256SUMS style file for the base image name. */
function shaFor(sums: string, version: string): string | null {
  // Collect all matching .img hashes, prefer amd64.
  const matches: { hash: string; name: string }[] = [];
  for (const line of sums.split('\n')) {
    const m = line.match(/([0-9a-f]{64})\s+\*?(.*\.img)$/);
    if (!m) continue;
    const name = m[2];
    if (!name.includes(version) || name.includes('lxd') || name.includes('rootfs')) continue;
    matches.push({ hash: m[1], name });
  }
  if (!matches.length) return null;
  const amd = matches.find((x) => x.name.includes('amd64') && !x.name.includes('amd64v'));
  return (amd ?? matches[0]).hash;
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

async function doSync(imageId: string): Promise<void> {
  const { getDb } = await import('@/lib/db');
  const { images } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const db = getDb();
  const row = (await db.select().from(images).where(eq(images.id, imageId)).limit(1))[0];
  if (!row) throw new Error(`unknown image ${imageId}`);
  const sp = storagePaths();
  fs.mkdirSync(sp.images, { recursive: true });
  const part = path.join(sp.images, `${imageId}.part`);
  const final = imagePathFor(imageId);

  try {
    let wantSha = '';
    if (row.sha256Url) {
      const tmpSums = part + '.sums';
      await fetchFile(row.sha256Url, tmpSums).catch(() => {});
      if (fs.existsSync(tmpSums)) {
        wantSha = shaFor(fs.readFileSync(tmpSums, 'utf8'), row.version ?? '') || '';
        await fsp.rm(tmpSums, { force: true });
      }
    }
    await db.update(images).set({ status: 'downloading', updatedAt: now() }).where(eq(images.id, imageId));
    await fetchFile(row.url, part);
    const got = await sha256File(part);
    if (wantSha && wantSha !== got) {
      throw new Error(`sha256 mismatch: got ${got.slice(0, 12)} want ${wantSha.slice(0, 12)}`);
    }
    fs.renameSync(part, final);
    // libvirt-qemu needs to read it directly from the pool dir.
    await fsp.chmod(final, 0o644).catch(() => {});
  } catch (e) {
    await fsp.rm(part, { force: true }).catch(() => {});
    await db.update(images).set({
      status: 'failed',
      failure: String((e as Error).message || e),
      updatedAt: now(),
    }).where(eq(images.id, imageId));
    throw e;
  }

  // Baseline-hash fallback when no published sums existed at first sync.
  const baseline = row.sha256 || (await sha256File(final));
  await db.update(images).set({
    status: 'ready',
    path: final,
    sha256: baseline,
    sizeBytes: fs.statSync(final).size,
    failure: null,
    updatedAt: now(),
  }).where(eq(images.id, imageId));
  await pexec(config.virshBin, ['-c', config.virshUri, 'pool-refresh', config.imagePool]).catch(() => {});
  void virsh;
}
