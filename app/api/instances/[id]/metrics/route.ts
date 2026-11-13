/**
 * Instance metrics over a selectable time window.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { now } from '@/lib/core/util';

type Ctx = { params: Promise<{ id: string }> };

/** Allowed windows. A range is an allowlist, not a free-form number: an
 *  unbounded `since` would let one request pull the entire retention window
 *  for every instance on a page of cards. */
const RANGES: Record<string, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
};

type MetricRow = { ts: number; cpuNs: number; ncpu: number; rdB: number; wrB: number; allocB: number; ramMaxKb: number };
type Point = { t: number; cpu: number; read: number; write: number };

/** Downsample long windows so a 7d view on a 20s sampler (30240 points)
 *  cannot ship 30k numbers to a sparkline. */
function bucketMsFor(span: number) {
  if (span > 24 * 3600_000) return 15 * 60_000;
  if (span > 6 * 3600_000) return 5 * 60_000;
  return 60_000;
}

function metricRows(id: string, since: number): MetricRow[] {
  return rawDb()
    .prepare(
      `select ts, cpu_ns as cpuNs, ncpu, rd_b as rdB, wr_b as wrB, alloc_b as allocB,
              ram_max_kb as ramMaxKb
       from metrics where instance_id = ? and ts >= ? order by ts asc`,
    )
    .all(id, since) as MetricRow[];
}

/** Average the derived rates inside each bucket. Rates are already deltas,
 *  so this is a mean of means over a fixed span and stays honest. */
function downsample(points: Point[], bucketMs: number): Point[] {
  const buckets = new Map<number, { cpu: number; read: number; write: number; count: number }>();
  for (const point of points) {
    const bucketStart = Math.floor(point.t / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart) ?? { cpu: 0, read: 0, write: 0, count: 0 };
    bucket.cpu += point.cpu; bucket.read += point.read; bucket.write += point.write; bucket.count += 1;
    buckets.set(bucketStart, bucket);
  }
  return [...buckets.entries()]
    .sort((first, second) => first[0] - second[0])
    .map(([t, bucket]) => ({
      t,
      cpu: Math.round((bucket.cpu / bucket.count) * 10) / 10,
      read: Math.round(bucket.read / bucket.count),
      write: Math.round(bucket.write / bucket.count),
    }));
}

function planShape(planId: string) {
  return rawDb().prepare(`select vcpu, ram_mb from plans where id = ?`).get(planId) as
    { vcpu: number; ram_mb: number } | undefined;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;

  // Ownership is re-read per request; never trust a client-held instance id.
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return err('not found', 404);
  if (inst.userId !== user.id && user.role !== 'admin') return err('forbidden', 403);

  const range = req.nextUrl.searchParams.get('range') ?? '1h';
  const span = RANGES[range];
  if (!span) return err(`unknown range; use one of ${Object.keys(RANGES).join(', ')}`, 400);

  const bucketMs = bucketMsFor(span);
  const sampleRows = metricRows(id, now() - span);
  const { derivePoints } = await import('@/lib/core/metrics');
  let points = derivePoints(sampleRows);
  if (bucketMs > 60_000 && points.length > 400) points = downsample(points, bucketMs);

  const last = sampleRows[sampleRows.length - 1];
  const plan = planShape(inst.planId);

  return json({
    ok: true,
    range,
    points,
    samples: sampleRows.length,
    ...metricTail(last, plan),
    running: inst.status === 'running',
  });
}

/** Allocated RAM in MB: the newest sample wins, the plan is the fallback. */
function ramAllocMb(last: MetricRow | undefined, plan: { vcpu: number; ram_mb: number } | undefined) {
  const kb = last?.ramMaxKb || (plan?.ram_mb ?? 0) * 1024;
  return Math.round(kb / 1024);
}

/** The summary fields derived from the newest sample and the plan. */
function metricTail(
  last: MetricRow | undefined,
  plan: { vcpu: number; ram_mb: number } | undefined,
) {
  return {
    allocBytes: last?.allocB ?? 0,
    ncpu: last?.ncpu || plan?.vcpu || 0,
    // Allocated, not observed. See metrics.ts for why balloon.current is not
    // a usable memory-usage signal on these guests.
    ramAllocMb: ramAllocMb(last, plan),
    ramObservable: false,
  };
}

export const dynamic = 'force-dynamic';
