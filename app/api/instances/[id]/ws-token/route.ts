import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { mintToken, type WsChannel } from '@/lib/core/tokens';
import { rateLimit } from '@/lib/core/crypto';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Issue a 120s single-channel HMAC token after session checks. WS upgrade
 * verifies the token again + checks instance status=running at relay time.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return err('not found', 404);
  if (inst.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);
  const body = (await req.json().catch(() => ({}))) as { type?: string };
  const typ: WsChannel = body.type === 'vnc' ? 'vnc' : body.type === 'term' ? 'term' : null as never;
  if (typ !== 'term' && typ !== 'vnc') return err('type must be term|vnc');
  if (!rateLimit(`wstok:${user.id}:${id}`, 20, 60_000)) return err('token endpoint rate limited', 429);
  if (inst.status !== 'running') {
    return err('instance is stopped; needs running state before terminal/console', 409);
  }

  // Token is bound to the requester: user A's token never opens user B's relay.
  return json({
    token: mintToken(id, typ, 120, user.id, user.role === 'admin'),
    expireSec: 120,
    note: 'single use per channel; refresh via POST',
  });
}

export const dynamic = 'force-dynamic';
