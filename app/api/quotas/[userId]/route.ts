/**
 * One account's quota: read it, edit it, and read the usage behind it.
 */
import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { quotaWithUsage } from '@/lib/core/quota';
import { now } from '@/lib/core/util';
import { logAudit } from '@/lib/services/audit';

type Ctx = { params: Promise<{ userId: string }> };

/** All users with their quota and live usage. Admin only: this is the whole
 *  capacity picture and every row is a customer. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const { userId } = await ctx.params;
  const rd = rawDb();
  const user = rd.prepare(`select id, name, role from users where id = ?`).get(userId) as
    { id: string; name: string; role: string } | undefined;
  if (!user) return err('user not found', 404);
  const { quota, usage } = quotaWithUsage(userId);
  return json({ ok: true, userId, name: user.name, role: user.role, quota, usage });
}

type QuotaRow = Record<string, unknown> | undefined;

/** Parse a quota bound. null => unlimited, 0 => none. */
function bound(v: unknown, name: string): number | null | undefined {
  if (v === undefined || v === '') return undefined; // leave as-is
  if (v === null || v === 'unlimited') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${name} must be a whole number, 0, or null for unlimited`);
  }
  return n;
}

type Bounds = {
  vms?: number | null; vcpus?: number | null; mem?: number | null;
  disk?: number | null; running?: number | null;
};

function parseBounds(body: Record<string, unknown>): Bounds | ReturnType<typeof err> {
  try {
    return {
      vms: bound(body.maxVms, 'maxVms'),
      vcpus: bound(body.maxVcpus, 'maxVcpus'),
      mem: bound(body.maxMemoryMb, 'maxMemoryMb'),
      disk: bound(body.maxDiskGb, 'maxDiskGb'),
      running: bound(body.maxRunning, 'maxRunning'),
    };
  } catch (err2) {
    return err((err2 as Error).message, 400);
  }
}

function suspendedFlag(v: unknown) {
  if (v === true || v === 'true') return 1;
  if (v === false || v === 'false') return 0;
  return undefined;
}

function noteText(v: unknown) {
  return typeof v === 'string' ? v.slice(0, 300) : undefined;
}

/** Field-by-field merge: an absent field keeps the stored value, an explicit
 *  null means unlimited and 0 means none. */
function mergeQuota(b: Bounds, suspended: number | undefined, note: string | undefined, existing: QuotaRow) {
  const pick = (v: number | null | undefined, col: string) =>
    v !== undefined ? v : (existing?.[col] as number | null) ?? null;
  return {
    max_vms: pick(b.vms, 'max_vms'),
    max_vcpus: pick(b.vcpus, 'max_vcpus'),
    max_memory_mb: pick(b.mem, 'max_memory_mb'),
    max_disk_gb: pick(b.disk, 'max_disk_gb'),
    max_running: pick(b.running, 'max_running'),
    suspended: suspended !== undefined ? suspended : Number(existing?.suspended ?? 0),
    note: note !== undefined ? note : (existing?.note as string | null) ?? null,
  };
}

function writeQuota(userId: string, merged: ReturnType<typeof mergeQuota>) {
  rawDb().prepare(
    `insert into quotas (user_id, max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running, suspended, note, updated_at)
     values (?,?,?,?,?,?,?,?,?)
     on conflict(user_id) do update set
       max_vms=excluded.max_vms, max_vcpus=excluded.max_vcpus,
       max_memory_mb=excluded.max_memory_mb, max_disk_gb=excluded.max_disk_gb,
       max_running=excluded.max_running, suspended=excluded.suspended,
       note=excluded.note, updated_at=excluded.updated_at`,
  ).run(userId, merged.max_vms, merged.max_vcpus, merged.max_memory_mb, merged.max_disk_gb,
    merged.max_running, merged.suspended, merged.note, now());
}

/**
 * Set a user's quota.
 *
 * Quota fields accept a number, or null for unlimited, or 0 for "none". An
 * empty string means "leave this one alone" so a client can PATCH one field
 * without having to re-send the rest and risk clobbering them.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const { user: admin, response: e } = await requireAdmin();
  if (e) return e;
  const { userId } = await ctx.params;

  const rd = rawDb();
  const user = rd.prepare(`select id, name from users where id = ?`).get(userId) as
    { id: string; name: string } | undefined;
  if (!user) return err('user not found', 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseBounds(body);
  if (parsed instanceof Response) return parsed;

  // A user may have a LOWERED quota below what they already use. That is legal
  // (they keep what they have, they just cannot grow), but it must be visible
  // rather than silently discovered when their next create fails.
  const existing = rd.prepare(`select * from quotas where user_id = ?`).get(userId) as QuotaRow;
  const merged = mergeQuota(parsed, suspendedFlag(body.suspended), noteText(body.note), existing);
  writeQuota(userId, merged);

  await logAudit({
    actorId: admin.id, actorName: admin.name, action: 'quota.set', target: userId,
    detail: merged as unknown as Record<string, unknown>,
  });

  const { quota, usage } = quotaWithUsage(userId);
  return json({ ok: true, userId, quota, usage });
}

export const dynamic = 'force-dynamic';
