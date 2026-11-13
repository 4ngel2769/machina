/**
 * Installer media, admin only.
 *
 * Upload is a raw body stream with the filename in the query: a multipart parse
 * would buffer the whole image in memory before the size cap could say no.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { config } from '@/lib/config';
import { listIsos, saveIso, deleteIso } from '@/lib/host/iso';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  try {
    return json({ isos: await listIsos(), maxIsoGb: config.limits.maxIsoGb });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;

  const name = req.nextUrl.searchParams.get('name') ?? '';
  const cap = config.limits.maxIsoGb * 1024 ** 3;
  // Reject on the declared length before reading a byte, so an oversized body
  // costs one round trip instead of the whole upload.
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared && declared > cap) return err(`iso exceeds the ${config.limits.maxIsoGb} GB upload cap`, 413);

  try {
    const iso = await saveIso(name, req.body);
    await logAudit({
      actorId: admin.id, actorName: admin.name, action: 'host.iso.upload',
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
