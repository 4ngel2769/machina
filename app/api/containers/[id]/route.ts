/** One container: recent output (GET) and start/stop/restart (POST). */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { containerAction, containerLogs, isAction, validRef, removeContainer } from '@/lib/host/docker';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);
  const tail = Number(req.nextUrl.searchParams.get('tail') ?? 200);
  try {
    return json({ logs: await containerLogs(id, Number.isFinite(tail) ? tail : 200) });
  } catch (error) {
    return err(friendlyError(error), 502);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: user, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);

  const body = await jsonBody(req, z.object({ action: z.unknown().optional() }).passthrough());
  if (!isAction(body.action)) return err('unknown action', 400);

  try {
    const result = await containerAction(id, body.action);
    await logAudit({
      actorId: user.id, actorName: user.name,
      action: `container.${body.action}`, target: id,
      detail: { result },
    });
    return json({ result });
  } catch (error) {
    return err(friendlyError(error), 409);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: user, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);
  try {
    const result = await removeContainer(id);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'container.remove', target: id, detail: { result } });
    return json({ result });
  } catch (error) {
    return err(friendlyError(error), 409);
  }
}
