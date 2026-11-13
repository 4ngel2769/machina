/**
 * Installer media.
 *
 * The admin route lists the whole library and can upload/delete anything.
 * Tenants get their own shelf through /api/isos/mine — same files, scoped by
 * the iso_uploads owner column. Upload is a raw body stream with the filename
 * in the query: a multipart parse would buffer the whole image in memory
 * before the size cap could say no.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { isoLimits } from '@/lib/host/iso-limits';
import { listIsos, saveIso, deleteIso } from '@/lib/host/iso';
import { checkIsoUpload } from '@/lib/core/quota';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  try {
    return json({ isos: await listIsos(), ...isoLimits() });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

/** Library-level caps checked BEFORE the body is read, so an over-quota
 *  upload costs one round trip. Returns the refusal response or null. */
async function libraryCapCheck(req: NextRequest) {
  const limits = isoLimits();
  const existing = await listIsos();
  const totalBytes = existing.reduce((sum, iso) => sum + iso.sizeMb * 1048576, 0);
  const totalCap = limits.maxIsoTotalGb * 1024 ** 3;
  // Reject on the declared length before reading a byte, so an oversized body
  // costs one round trip instead of the whole upload.
  const declared = Number(req.headers.get('content-length') ?? 0);
  const perFileCap = limits.maxIsoGb * 1024 ** 3;
  if (declared > perFileCap) return err(`iso exceeds the ${limits.maxIsoGb} GB upload cap`, 413);
  if (declared && totalBytes + declared > totalCap) {
    return err(`upload would exceed the ${limits.maxIsoTotalGb} GB library cap`, 413);
  }
  return null;
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user, response: denied } = await requireAdmin();
  if (denied) return denied;

  const name = req.nextUrl.searchParams.get('name') ?? '';
  const capRefusal = await libraryCapCheck(req);
  if (capRefusal) return capRefusal;

  try {
    // Admins upload unowned (null) — shelf media for the host console, not a
    // tenant's quota. Tenants go through /api/isos/mine instead.
    const iso = await saveIso(name, req.body, null);
    await logAudit({
      actorId: user.id, actorName: user.name, action: 'host.iso.upload',
      target: iso.name, detail: { sizeMb: iso.sizeMb, sha256: iso.sha256 },
    });
    return json({ ok: true, iso });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function DELETE(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;

  const name = req.nextUrl.searchParams.get('name') ?? '';
  try {
    const result = await deleteIso(name);
    await logAudit({ actorId: admin.id, actorName: admin.name, action: 'host.iso.delete', target: name });
    return json({ ok: true, result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
