import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { quotaWithUsage, getHostCommitted, hostCapacity } from '@/lib/core/quota';

/**
 * Fleet-wide quota picture. ADMIN ONLY.
 *
 * Every row here is a customer and the numbers are what they are consuming, so
 * this is deliberately not available to a normal account — a tenant can read
 * their own quota at /api/quota and nothing else.
 */
export async function GET(_req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  if (user.role !== 'admin') return err('admin only', 403);

  const rd = rawDb();
  const users = rd.prepare(`select id, name, role, balance_cents as balanceCents from users order by name`)
    .all() as { id: string; name: string; role: string; balanceCents: number }[];

  const rows = users.map((u) => {
    const { quota, usage } = quotaWithUsage(u.id);
    return { userId: u.id, name: u.name, role: u.role, balanceCents: u.balanceCents, quota, usage };
  });

  return json({ ok: true, rows, host: { committed: getHostCommitted(), capacity: hostCapacity() } });
}

export const dynamic = 'force-dynamic';