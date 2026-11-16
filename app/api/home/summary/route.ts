/**
 * One-payload dashboard summary: instances (with joined plan specs), per-
 * instance usage sparklines, balance, accrued-but-unsettled charges and the
 * pending-request count. Replaces the home page's N+1 fan-out — one request
 * per 10s poll instead of 3 + one per VM.
 */
import { requireUser } from '@/lib/auth';
import { json, err, requireScope } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { pendingChargesCents } from '@/lib/core/metering';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type InstRow = {
  id: string; name: string; status: string; plan_id: string; ip: string;
  created_at: number; rate_hourly_cents: number;
  plan_name: string; vcpu: number; ram_mb: number;
};

export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('instances:read');
  if (scopeDenied) return scopeDenied;

  const raw = rawDb();
  const instRows = (user.role === 'admin'
    ? raw.prepare(
        `select i.id, i.name, i.status, i.plan_id, i.ip, i.created_at, i.rate_hourly_cents,
                p.name as plan_name, p.vcpu, p.ram_mb
         from instances i join plans p on p.id = i.plan_id
         order by i.created_at desc`,
      ).all()
    : raw.prepare(
        `select i.id, i.name, i.status, i.plan_id, i.ip, i.created_at, i.rate_hourly_cents,
                p.name as plan_name, p.vcpu, p.ram_mb
         from instances i join plans p on p.id = i.plan_id
         where i.user_id = ?
         order by i.created_at desc`,
      ).all(user.id)) as InstRow[];

  // Sparklines: last 48 samples per instance in ONE query, bucketed in JS.
  const spark = new Map<string, { ts: number; running: number; weight: number }[]>();
  if (instRows.length) {
    const marks = instRows.map(() => '?').join(',');
    const ids = instRows.map((row) => row.id);
    const usageRows = raw.prepare(
      `select instance_id, ts, running, weight from (
         select instance_id, ts, running, weight,
                row_number() over (partition by instance_id order by ts desc) as rn
         from usage where instance_id in (${marks})
       ) where rn <= 48 order by ts`,
    ).all(...ids) as { instance_id: string; ts: number; running: number; weight: number }[];
    for (const row of usageRows) {
      const list = spark.get(row.instance_id) ?? [];
      list.push({ ts: row.ts, running: row.running, weight: row.weight });
      spark.set(row.instance_id, list);
    }
  }

  const balanceRow = raw.prepare(`select balance_cents from users where id=?`).get(user.id) as
    { balance_cents: number } | undefined;
  const pendingReqs = (raw.prepare(
    `select count(*) c from instance_requests where user_id=? and status='pending'`,
  ).get(user.id) as { c: number }).c ?? 0;
  const accrued = pendingChargesCents(user.id);

  return json({
    instances: instRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      planId: row.plan_id,
      ip: row.ip,
      createdAt: row.created_at,
      rateHourlyCents: row.rate_hourly_cents,
      planName: row.plan_name,
      vcpu: row.vcpu,
      ramMb: row.ram_mb,
      spark: spark.get(row.id) ?? [],
    })),
    balanceCents: balanceRow?.balance_cents ?? null,
    pendingRequests: pendingReqs,
    accruedCents: accrued.cents,
    accruedHours: accrued.hours,
  });
}
