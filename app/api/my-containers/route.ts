/**
 * The caller's own containers.
 *
 * GET lists only containers the user owns (machina.owner label); POST creates
 * one on their private docker bridge after the container quota check. Admins
 * use /api/containers for the whole-fleet view — this route is deliberately
 * narrower so a tenant can never see or touch someone else's stack.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, jsonBody } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';
import { listContainers, dockerAvailable } from '@/lib/host/docker';
import { parseCreate, createContainer } from '@/lib/host/docker-create';
import { checkContainerQuota } from '@/lib/core/quota';
import { rawDb } from '@/lib/db';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Owner names for display, one query for the whole list. */
function ownerNames(ids: string[]): Map<string, string> {
  if (!ids.length) return new Map();
  const marks = ids.map(() => '?').join(',');
  const rows = rawDb()
    .prepare(`select id, name from users where id in (${marks})`)
    .all(...ids) as { id: string; name: string }[];
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  const available = await dockerAvailable();
  if (!available) return json({ available: false, containers: [], error: null });
  try {
    const all = await listContainers();
    const mine = all.filter((container) => container.ownerId === user.id);
    const names = ownerNames(mine.map((container) => container.ownerId!).filter(Boolean));
    return json({
      available: true,
      containers: mine.map((container) => ({
        ...container,
        ownerName: container.ownerId ? names.get(container.ownerId) ?? container.ownerName : container.ownerName,
      })),
      error: null,
    });
  } catch (error) {
    return json({ available: true, containers: [], error: friendlyError(error) });
  }
}

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  const body = await jsonBody(req, z.object({}).passthrough());
  try {
    const spec = parseCreate(body);
    // Tenant creates are always private-network; ports are meaningless there.
    const verdict = checkContainerQuota(user.id, { memoryMb: spec.memoryMb ?? 512, cpus: spec.cpus ?? 1 });
    if (!verdict.allowed) return err(verdict.reason, 409);
    const id = await createContainer({
      ...spec,
      network: 'user',
      ownerId: user.id,
      ownerName: user.name,
    });
    await logAudit({
      actorId: user.id, actorName: user.name,
      action: 'container.create', target: spec.name,
      detail: { image: spec.image, memoryMb: spec.memoryMb, cpus: spec.cpus, network: 'user' },
    });
    return json({ ok: true, id, name: spec.name });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
