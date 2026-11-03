import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return err('not found', 404);
  if (inst.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);
  const rd = rawDb();
  const rows = rd.prepare(`select ts, running, weight from usage where instance_id=? order by ts desc limit 48`).all(id) as { ts: number; running: number; weight: number }[];
  return json(rows.reverse());
}

export const dynamic = 'force-dynamic';
