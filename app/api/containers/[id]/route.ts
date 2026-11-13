/** One container: recent output (GET) and start/stop/restart (POST). */

import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { containerAction, containerLogs, isAction, validRef } from '@/lib/host/docker';
import { removeContainer } from '@/lib/host/docker-create';
import { mintToken } from '@/lib/core/tokens';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);

  // ?tab=inspect|stats return the detail payloads; default is the log tail.
  const tab = req.nextUrl.searchParams.get('tab');
  try {
    if (tab === 'inspect') {
      const { inspectContainer } = await import('@/lib/host/docker-admin');
      return json({ detail: await inspectContainer(id) });
    }
    if (tab === 'stats') {
      const { containerStats } = await import('@/lib/host/docker-admin');
      return json({ stats: await containerStats(id) });
    }
    const tail = Number(req.nextUrl.searchParams.get('tail') ?? 200);
    return json({ logs: await containerLogs(id, Number.isFinite(tail) ? tail : 200) });
  } catch (error) {
    return err(friendlyError(error), 502);
  }
}

/** Mint a short-lived ws token for the container's logs or exec stream.
 *  exec additionally requires the container to be running right now — the
 *  token outlives a state change, so the check happens per-mint, and again
 *  at upgrade time. */
async function mintChannelToken(id: string, channel: unknown, userId: string) {
  if (channel !== 'exec' && channel !== 'logs') return null;
  if (channel === 'exec') {
    try {
      const { inspectContainer } = await import('@/lib/host/docker-admin');
      const detail = await inspectContainer(id);
      if (detail.state !== 'running') return err('container is not running', 409);
    } catch (error) {
      return err(friendlyError(error), 404);
    }
  }
  return json({ token: mintToken(id, channel, 120, userId, true) });
}

async function renameAction(id: string, body: Record<string, unknown>, user: { id: string; name: string }) {
  try {
    const { renameContainer } = await import('@/lib/host/docker');
    const name = String(body.name ?? '').trim();
    const result = await renameContainer(id, name);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'container.rename', target: id, detail: { name } });
    return json({ result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: user, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);

  const body = await jsonBody(req, z.object({ action: z.unknown().optional(), name: z.unknown().optional(), channel: z.unknown().optional() }).passthrough());

  // {channel:'exec'|'logs'} mints a 120s ws token for the container streams.
  if (body.channel === 'exec' || body.channel === 'logs') {
    const minted = await mintChannelToken(id, body.channel, user.id);
    if (minted) return minted;
  }

  // {action:'rename', name:'new-name'} is a rename, not a lifecycle verb.
  if (body.action === 'rename') return renameAction(id, body, user);

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
