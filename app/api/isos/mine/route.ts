/**
 * The caller's own ISO shelf: list, upload, delete — all scoped to the
 * iso_uploads owner column. Global library caps (iso.limits) still apply on
 * top of the per-user tier in quotas; checkIsoUpload enforces both.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { isoLimits } from '@/lib/host/iso-limits';
import { listIsos, saveIso, deleteIso, isoOwner } from '@/lib/host/iso';
import { checkIsoUpload } from '@/lib/core/quota';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  try {
    const isos = await listIsos(user.id);
    const limits = isoLimits();
    const { getQuota } = await import('@/lib/core/quota');
    const quota = getQuota(user.id);
    // Usage counts only what the user owns; the unowned admin shelf is shared
    // and does not count against their tier.
    const own = isos.filter((iso) => iso.ownerId === user.id);
    const usedBytes = own.reduce((sum, iso) => sum + iso.sizeMb * 1048576, 0);
    return json({
      isos,
      maxIsoGb: limits.maxIsoGb,
      quota: { maxIsoCount: quota.maxIsoCount, maxIsoTotalGb: quota.maxIsoTotalGb },
      usage: { count: own.length, totalGb: Math.round(usedBytes / 1024 ** 3 * 10) / 10 },
    });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

/** Post-upload tier re-check: the pre-check ran on the DECLARED length, so
 *  a chunked or lied body can slip past it. Verify against the real size
 *  (already registered — no double count) and roll the file back if needed. */
async function verifyAfterUpload(userId: string, iso: { name: string; sizeMb: number; sizeBytes?: number }): Promise<string | null> {
  const after = checkIsoUpload(userId, iso.sizeBytes ?? iso.sizeMb * 1048576, { alreadyRegistered: true });
  if (after.allowed) return null;
  const { deleteIso } = await import('@/lib/host/iso');
  await deleteIso(iso.name).catch(() => {});
  return after.reason;
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  const name = req.nextUrl.searchParams.get('name') ?? '';
  const declared = Number(req.headers.get('content-length') ?? 0);
  // Quota first: it is cheaper than reading the body and gives the better
  // error. The per-file cap inside checkIsoUpload covers the declared length.
  const verdict = checkIsoUpload(user.id, declared || 0);
  if (!verdict.allowed) return err(verdict.reason, declared > isoLimits().maxIsoGb * 1024 ** 3 ? 413 : 409);

  try {
    const iso = await saveIso(name, req.body, user.id);
    const violation = await verifyAfterUpload(user.id, iso);
    if (violation) return err(violation, 409);
    await logAudit({
      actorId: user.id, actorName: user.name, action: 'iso.upload',
      target: iso.name, detail: { sizeMb: iso.sizeMb },
    });
    return json({ ok: true, iso });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function DELETE(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  const name = req.nextUrl.searchParams.get('name') ?? '';
  // Only the owner (or an admin via /api/isos) may delete. Unowned shelf
  // files are admin territory.
  const owner = isoOwner(name);
  if (owner !== null && owner !== user.id) return err('not your iso', 403);
  if (owner === null && user.role !== 'admin') return err('not your iso', 403);
  try {
    const result = await deleteIso(name);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'iso.delete', target: name });
    return json({ ok: true, result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
