/**
 * Admin: read or set any user's private-network subnet pick.
 * Same rules as /api/net — locked once the user has instances — but the
 * actor is the admin, so the audit row names them.
 */
import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { rawDb } from '@/lib/db';
import { currentPick, setUserNetPick, V4_POOL, V6_POOL, type UserNetRow } from '@/lib/core/usernetpick';
import { rowToNetPublic } from '@/lib/core/usernet';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

type Ctx = { params: Promise<{ userId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { response: denied } = await requireAdmin();
  if (denied) return denied;
  const { userId } = await ctx.params;
  const user = rawDb().prepare(`select id, name from users where id=?`).get(userId) as { id: string; name: string } | undefined;
  if (!user) return err('user not found', 404);
  const row = rawDb().prepare(`select * from user_nets where user_id=?`).get(userId) as UserNetRow | undefined;
  return json({
    user: { id: user.id, name: user.name },
    pools: { v4: V4_POOL, v6: V6_POOL },
    pick: currentPick(userId),
    net: row ? rowToNetPublic(row) : null,
  });
}

const bodySchema = z.object({
  v4: z.string().max(64).optional(),
  v6: z.string().max(64).optional(),
  reset: z.boolean().optional(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { userId } = await ctx.params;
  const body = await jsonBody(req, bodySchema);
  try {
    const result = body.reset
      ? setUserNetPick(userId, null)
      : setUserNetPick(userId, { v4: body.v4, v6: body.v6 });
    await logAudit({
      actorId: admin!.id, actorName: admin!.name, action: 'admin.net.pick',
      target: userId, detail: { v4: result.v4, v6: result.v6, reset: !!body.reset },
    });
    return json({ ok: true, pick: result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export const dynamic = 'force-dynamic';
