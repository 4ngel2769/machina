/**
 * ISO library limits, admin only. GET returns the effective caps (stored
 * override or config default); PUT stores a new set. Tiers are deliberately
 * flat numbers, not per-plan: the library is a host resource, not a tenant
 * quota, so one set of caps governs every upload.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { isoLimits, saveIsoLimits } from '@/lib/host/iso-limits';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  return json(isoLimits());
}

export async function PUT(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const limits = saveIsoLimits(body);
    await logAudit({
      actorId: admin.id, actorName: admin.name, action: 'host.iso.limits',
      target: 'iso-library', detail: limits,
    });
    return json({ ok: true, ...limits });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
