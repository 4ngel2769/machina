/**
 * Billing API: the caller's balance, ledger history and host capacity.
 * Ledger pages backwards with a cursor: ?before=<createdAt>:<id> returns the
 * 50 rows older than that position, plus nextCursor when more remain.
 */
import { requireUser } from '@/lib/auth';
import { json, err, requireScope } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { config } from '@/lib/config';
import { pendingChargesCents } from '@/lib/core/metering';
import { NextRequest } from 'next/server';

const PAGE = 50;

type LedgerRow = {
  id: string; delta_cents: number; reason: string;
  ref_type: string | null; ref_id: string | null; note: string | null; created_at: number;
};

function toEntry(row: LedgerRow) {
  return {
    id: row.id,
    deltaCents: row.delta_cents,
    reason: row.reason,
    refType: row.ref_type,
    refId: row.ref_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

/** Parse "<createdAt>:<id>" into a query cursor, or null when absent/bad. */
function parseCursor(before: string | null): { ts: number; id: string } | null {
  if (!before) return null;
  const [ts, id] = before.split(':');
  const cursorTs = Number(ts);
  if (!Number.isFinite(cursorTs) || !id) return null;
  return { ts: cursorTs, id };
}

function ledgerPage(userId: string, cursor: { ts: number; id: string } | null): LedgerRow[] {
  const raw = rawDb();
  if (cursor) {
    return raw.prepare(
      `select * from ledger where user_id=? and (created_at < ? or (created_at = ? and id < ?))
       order by created_at desc, id desc limit ?`,
    ).all(userId, cursor.ts, cursor.ts, cursor.id, PAGE + 1) as LedgerRow[];
  }
  return raw.prepare(
    `select * from ledger where user_id=? order by created_at desc, id desc limit ?`,
  ).all(userId, PAGE + 1) as LedgerRow[];
}

/** User's own billing view: balance + paginated ledger + accrued + capacity. */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('billing:read');
  if (scopeDenied) return scopeDenied;
  const raw = rawDb();
  const balanceRow = raw.prepare(`select balance_cents from users where id=?`).get(user.id) as { balance_cents: number } | undefined;
  if (!balanceRow) return err('no user', 404);

  const cursor = parseCursor(req.nextUrl.searchParams.get('before'));
  const rows = ledgerPage(user.id, cursor);
  const hasMore = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? `${last.created_at}:${last.id}` : null;

  const accrued = pendingChargesCents(user.id);
  const runningCount = (raw.prepare(`select count(*) c from instances where status='running'`).get() as { c: number }).c;
  return json({
    balanceCents: balanceRow.balance_cents,
    ledger: page.map(toEntry),
    nextCursor,
    accruedCents: accrued.cents,
    accruedHours: accrued.hours,
    capacity: { running: runningCount, max: config.limits.maxRunningTotal },
  });
}

export const dynamic = 'force-dynamic';
