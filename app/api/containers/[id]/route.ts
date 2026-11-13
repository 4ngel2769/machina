import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { containerAction, containerLogs, isAction, validRef, removeContainer } from '@/lib/host/docker';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

/** One container: recent output (GET) and start/stop/restart (POST). */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const [, denied] = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);
  const tail = Number(req.nextUrl.searchParams.get('tail') ?? 200);
  try {
    return json({ logs: await containerLogs(id, Number.isFinite(tail) ? tail : 200) });
  } catch (e) {
    return err(friendlyError(e), 502);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const [user, denied] = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (!isAction(body.action)) return err('unknown action', 400);

  try {
    const result = await containerAction(id, body.action);
    await logAudit({
      actorId: user.id, actorName: user.name,
      action: `container.${body.action}`, target: id,
      detail: { result },
    });
    return json({ result });
  } catch (e) {
    return err(friendlyError(e), 409);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const [user, denied] = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!validRef(id)) return err('invalid container reference', 400);
  try {
    const result = await removeContainer(id);
    await logAudit({ actorId: user.id, actorName: user.name, action: 'container.remove', target: id, detail: { result } });
    return json({ result });
  } catch (e) {
    return err(friendlyError(e), 409);
  }
}
