import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { getDb } from '@/lib/db';
import { images } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { storagePaths, config } from '@/lib/config';
import { logAudit } from '@/lib/services/audit';
import { now } from '@/lib/core/util';

const pexec = promisify(execFile);
const MAX_IMPORT_BYTES = 200 * 1024 ** 3;
const ID_RE = /^[a-z0-9][a-z0-9._-]{1,60}$/;

async function qemuImgInfo(file: string): Promise<Record<string, unknown>> {
  const { stdout } = await pexec('qemu-img', ['info', '--output=json', file], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const [user, denied] = await requireAdmin();
  if (denied) return denied;

  const id = String(req.nextUrl.searchParams.get('id') ?? '').trim().toLowerCase();
  const name = String(req.nextUrl.searchParams.get('name') ?? id).trim() || id;
  if (!ID_RE.test(id)) return err('id must be lowercase letters, digits, dot, dash or underscore', 400);
  if (!name || name.length > 80) return err('name required (max 80 chars)', 400);

  const body = req.body;
  if (!body) return err('empty request body', 400);

  const dir = storagePaths().images;
  await fs.mkdir(dir, { recursive: true });
  const existing = await getDb().select({ id: images.id }).from(images).where(eq(images.id, id));
  if (existing.length) return err('an image with that id already exists', 409);

  const tmp = path.join(dir, `.import-${crypto.randomUUID()}.part`);
  const final = path.join(dir, `${id}.qcow2`);
  const hash = crypto.createHash('sha256');
  const ws = createWriteStream(tmp, { mode: 0o640 });
  let size = 0;

  try {
    for await (const chunk of Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])) {
      const buf = Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > MAX_IMPORT_BYTES) throw new Error(`image exceeds the ${Math.round(MAX_IMPORT_BYTES / 1024 ** 3)} GB import limit`);
      hash.update(buf);
      if (!ws.write(buf)) await new Promise<void>((res) => ws.once('drain', () => res()));
    }
    await new Promise<void>((resolve, reject) => {
      ws.once('finish', () => resolve());
      ws.once('error', reject);
      ws.end();
    });
  } catch (e) {
    ws.destroy();
    await fs.rm(tmp, { force: true }).catch(() => {});
    return err((e as Error).message || 'upload failed', 400);
  }

  const sha256 = hash.digest('hex');
  try {
    const info = await qemuImgInfo(tmp);
    if (info.format !== 'qcow2') throw new Error(`only qcow2 images can be imported (got ${String(info.format)})`);
    if (info['backing-filename']) throw new Error('backed qcow2 images are not supported — flatten or convert to a standalone qcow2 first');
    if (info.encrypted === true) throw new Error('encrypted qcow2 images are not supported');
    await fs.rename(tmp, final);
    await fs.chmod(final, 0o644).catch(() => {});
    await getDb().insert(images).values({
      id,
      name,
      distro: null,
      version: null,
      url: 'manual-upload',
      sha256,
      sha256Url: '',
      path: final,
      status: 'ready',
      failure: null,
      sizeBytes: size,
      updatedAt: now(),
    });
    await pexec(config.virshBin, ['-c', config.virshUri, 'pool-refresh', config.imagePool]).catch(() => {});
    await logAudit({ actorId: user.id, actorName: user.name, action: 'image.import', target: id, detail: { name, size, sha256 } });
    return json({ ok: true, id, name, sizeBytes: size, sha256 });
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    await fs.rm(final, { force: true }).catch(() => {});
    return err((e as Error).message || 'import validation failed', 400);
  }
}
