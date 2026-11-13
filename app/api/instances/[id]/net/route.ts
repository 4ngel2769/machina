/**
 * Bandwidth detail for one instance: monthly totals plus the recent sample
 * series the rate graph draws from.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, requireScope } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { bandState } from '@/lib/core/netmeter';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const denied = await requireScope('instances:read');
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return err('not found', 404);
  if (inst.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);

  const state = bandState(inst.id, inst.bandwidthGb);
  const samples = rawDb().prepare(
    `select ts, rx_delta as rxDelta, tx_delta as txDelta from net_samples
     where instance_id=? order by ts desc limit 672`, // ~7 days at 15min
  ).all(inst.id) as { ts: number; rxDelta: number; txDelta: number }[];

  return json({ ok: true, month: state.month, rxBytes: state.rxBytes, txBytes: state.txBytes, quotaGb: state.quotaGb, throttled: state.throttled, samples: samples.reverse() });
}
