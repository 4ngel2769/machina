/**
 * The caller's private network: current pick, pool rules, and set/clear.
 *
 * GET  -> { pick: {v4,v6,locked,count} | null, pools: {v4,v6}, net: UserNet | null }
 * POST -> { v4?, v6? } set the pick, or { reset: true } to return to auto.
 *
 * The pick only takes effect on the NEXT provision — a user with no
 * user_nets row gets one written now (idx claimed, libvirt net still lazy),
 * and ensureUserNet defines it with these subnets on first VM create.
 * Once any instance exists the pick is locked: guest addresses are baked
 * into cloud-init seeds, so a change would strand every VM.
 */
import { NextRequest } from 'next/server';
import { json, err, guardMutation, jsonBody } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { z } from 'zod';
import { rawDb } from '@/lib/db';
import { currentPick, setUserNetPick, V4_POOL, V6_POOL, type UserNetRow } from '@/lib/core/usernetpick';
import { rowToNetPublic } from '@/lib/core/usernet';
import { logAudit } from '@/lib/services/audit';
import { friendlyError } from '@/lib/core/errors';

/** What the UI needs to render the picker: rules + current state. */
export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const pick = currentPick(user.id);
  const row = rawDb().prepare(`select * from user_nets where user_id=?`).get(user.id) as UserNetRow | undefined;
  return json({
    pools: { v4: V4_POOL, v6: V6_POOL },
    pick,
    net: row ? rowToNetPublic(row) : null,
  });
}

const bodySchema = z.object({
  v4: z.string().max(64).optional(),
  v6: z.string().max(64).optional(),
  reset: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const body = await jsonBody(req, bodySchema);
  try {
    const result = body.reset
      ? setUserNetPick(user.id, null)
      : setUserNetPick(user.id, { v4: body.v4, v6: body.v6 });
    await logAudit({
      actorId: user.id, actorName: user.name, action: 'net.pick',
      target: user.id, detail: { v4: result.v4, v6: result.v6, reset: !!body.reset },
    });
    return json({ ok: true, pick: result });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

export const dynamic = 'force-dynamic';
