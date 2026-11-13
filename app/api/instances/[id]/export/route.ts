/**
 * Instance disk export: mint a short-lived download token, then stream the qcow2.
 */
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { err, json, guardMutation } from '@/lib/api';
import { getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { diskVolFromId } from '@/lib/core/disks';
import { storagePaths } from '@/lib/config';
import { logAudit } from '@/lib/services/audit';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';

type Ctx = { params: Promise<{ id: string }> };
const MAX_EXPORT_BYTES = 200 * 1024 ** 3;
const EXPORTABLE = ['stopped', 'suspended', 'error'];

function tokenKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 24) throw new Error('export token service unavailable');
  return createHmac('sha256', secret).update('machina-export-v1').digest();
}

function sign(payload: string): string {
  return createHmac('sha256', tokenKey()).update(payload).digest('base64url');
}

function payloadOk(p: { id: string; uid: string; exp: number }, id: string, uid: string) {
  const nowMs = Date.now();
  return p.id === id && p.uid === uid && Number.isSafeInteger(p.exp) && p.exp >= nowMs && p.exp <= nowMs + 6 * 60_000;
}

function verify(token: string, id: string, uid: string): boolean {
  const [body, signature] = token.split('.');
  if (!body || !signature) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { id: string; uid: string; exp: number; nonce: string };
    return payloadOk(p, id, uid);
  } catch { return false; }
}

type User = { id: string; name: string; role: string };

/** Session + ownership; the stopped-state rule is opt-in because GET checks
 *  the token BEFORE status while POST checks status first. */
async function loadExportable(id: string, user: User, requireStopped: boolean) {
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return err('not found', 404);
  if (inst.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);
  if (requireStopped && !EXPORTABLE.includes(inst.status)) return err('stop the VM before exporting its disk', 409);
  return inst;
}

function diskPath(id: string) {
  return path.join(storagePaths().vms, `${diskVolFromId(id)}.qcow2`);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const inst = await loadExportable(id, user, true);
  if (inst instanceof Response) return inst;
  try {
    const file = diskPath(id);
    const st = await fs.stat(file);
    if (!st.isFile() || st.size > MAX_EXPORT_BYTES) return err('disk is not a regular file or exceeds export limit', 413);
    const payload = Buffer.from(JSON.stringify({ id, uid: user.id, exp: Date.now() + 5 * 60_000, nonce: randomUUID() })).toString('base64url');
    const token = `${payload}.${sign(payload)}`;
    await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.export.token', target: id, detail: { size: st.size } });
    return json({ url: `/api/instances/${id}/export?token=${encodeURIComponent(token)}`, filename: `${inst.name}.qcow2`, size: st.size, expiresInSec: 300 });
  } catch (e) {
    return err((e as Error).message || 'disk unavailable', 404);
  }
}

function qcow2Stream(file: string, size: number, filename: string) {
  const body = createReadStream(file);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      body.on('data', (chunk) => controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))));
      body.on('end', () => controller.close());
      body.on('error', (e) => controller.error(e));
    },
    cancel() { body.destroy(); },
  });
  return new NextResponse(stream, { headers: {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(size),
    'Content-Disposition': `attachment; filename="${filename}.qcow2"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const inst = await loadExportable(id, user, false);
  if (inst instanceof Response) return inst;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!verify(token, id, user.id)) return err('invalid or expired export token', 403);
  if (!EXPORTABLE.includes(inst.status)) return err('stop the VM before exporting its disk', 409);
  const file = diskPath(id);
  const st = await fs.stat(file).catch(() => null);
  if (!st?.isFile() || st.size > MAX_EXPORT_BYTES) return err('disk unavailable or exceeds export limit', 404);
  await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.export', target: id, detail: { size: st.size } });
  const filename = inst.name.replace(/[^A-Za-z0-9._-]/g, '_');
  return qcow2Stream(file, st.size, filename);
}

export const dynamic = 'force-dynamic';
