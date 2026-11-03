import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, rateLimit } from '@/lib/core/crypto';
import { now } from '@/lib/core/util';
import { logAudit } from '@/lib/services/audit';

/**
 * Self-service credential change: verify current password, then rehash.
 * Persists across restarts — seed only inserts the admin (env rotation is now
 * opt-in via ADMIN_FORCE_RESET=1 in machina.env, never implicit).
 */
export async function POST(req: NextRequest) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  if (!rateLimit(`pw:${user.id}`, 5, 10 * 60_000)) return err('too many attempts', 429);

  const body = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  const current = typeof body.current === 'string' ? body.current : '';
  const next = typeof body.next === 'string' ? body.next : '';
  if (!current || !next) return err('current and next required');
  if (next.length < 8 || next.length > 72) return err('password: 8-72 chars (72 is bcrypt cap)');

  const [row] = await rawDb().prepare('select password_hash from users where id=?').all(user.id) as { password_hash: string | null }[];
  if (!row?.password_hash) return err('no password set', 400);
  if (!verifyPassword(current, row.password_hash)) return err('current password wrong', 401);

  await getDb().update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, user.id));
  await logAudit({ actorId: user.id, actorName: user.name, action: 'auth.changePassword' });
  return json({ ok: true, at: now(), note: 'password persists across restarts' });
}

export const dynamic = 'force-dynamic';
