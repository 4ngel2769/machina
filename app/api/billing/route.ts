/**
 * Billing API: the caller's balance, recent ledger rows and host capacity.
 */
import { requireUser } from '@/lib/auth';
import { json, err, requireScope } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';

/** User's own billing view: balance + last 50 ledger rows + host capacity. */
export async function GET() {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('billing:read');
  if (scopeDenied) return scopeDenied;
  const raw = rawDb();
  const balanceRow = raw.prepare(`select balance_cents from users where id=?`).get(user.id) as { balance_cents: number } | undefined;
  if (!balanceRow) return err('no user', 404);
  const rawLedger = raw.prepare(`select * from ledger where user_id=? order by created_at desc limit 50`).all(user.id) as {
    id: string; user_id: string; delta_cents: number; reason: string;
    ref_type: string | null; ref_id: string | null; note: string | null; created_at: number;
  }[];
  const ledger = rawLedger.map((row) => ({
    id: row.id,
    deltaCents: row.delta_cents,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    note: row.note,
    createdAt: row.created_at,
  }));
  const runningCount = (raw.prepare(`select count(*) c from instances where status='running'`).get() as { c: number }).c;
  return json({
    balanceCents: balanceRow.balance_cents,
    ledger,
    capacity: { running: runningCount, max: config.limits.maxRunningTotal },
  });
}

export const dynamic = 'force-dynamic';
