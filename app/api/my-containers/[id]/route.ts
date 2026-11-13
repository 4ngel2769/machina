/**
 * One of the caller's containers: lifecycle action or log tail.
 * Ownership is verified against the machina.owner label before anything
 * touches docker — a tenant can never drive someone else's container by id.
 */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, jsonBody } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';
import { containerAction, isAction, containerLogs, validRef } from '@/lib/host/docker';
import { removeContainer } from '@/lib/host/docker-create';
import { run } from '@/lib/host/exec';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

async function ownerOf(ref: string): Promise<string | null> {
  const out = await run(
    'docker',
    ['inspect', '--format', '{{index .Config.Labels "machina.owner"}}', ref],
    { timeout: 10_000 },
  ).catch(() => '');
  return out.trim() || null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const ref = decodeURIComponent(id);
  if (!validRef(ref)) return err('invalid container reference', 400);
  if ((await ownerOf(ref)) !== user.id) return err('not your container', 403);

  const tail = Number(req.nextUrl.searchParams.get('tail') ?? 200);
  try {
    if (req.nextUrl.searchParams.get('logs') === '1') {
      return json({ logs: await containerLogs(ref, tail) });
    }
    return json({ ok: true });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'restart', 'pause', 'unpause', 'kill', 'remove', 'logs']),
  tail: z.number().int().min(10).max(2000).optional(),
}).passthrough();

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const ref = decodeURIComponent(id);
  if (!validRef(ref)) return err('invalid container reference', 400);
  if ((await ownerOf(ref)) !== user.id) return err('not your container', 403);

  const body = await jsonBody(req, actionSchema);
  const action = body.action;
  try {
    if (action === 'logs') {
      return json({ logs: await containerLogs(ref, body.tail ?? 200) });
    }
    if (action === 'remove') {
      await removeContainer(ref);
      await logAudit({ actorId: user.id, actorName: user.name, action: 'container.remove', target: ref });
      return json({ ok: true });
    }
    if (isAction(action)) {
      await containerAction(ref, action);
      await logAudit({ actorId: user.id, actorName: user.name, action: `container.${action}`, target: ref });
      return json({ ok: true });
    }
    return err('unknown action', 400);
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}
