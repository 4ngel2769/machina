import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { quotaWithUsage, getHostCommitted, hostCapacity } from '@/lib/core/quota';
import { now } from '@/lib/core/util';
import { logAudit } from '@/lib/services/audit';

type Ctx = { params: Promise<{ userId: string }> };

function requireAdmin() {
  return requireUser().then((u) => {
    if (!u) return [null, err('unauthorized', 401)] as const;
    if (u.role !== 'admin') return [null, err('admin only', 403)] as const;
    return [u, null] as const;
  });
}

/** All users with their quota and live usage. Admin only: this is the whole
 *  capacity picture and every row is a customer. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const [admin, e] = await requireAdmin();
  if (e) return e;
  const { userId } = await ctx.params;
  const rd = rawDb();
  const user = rd.prepare(`select id, name, role from users where id = ?`).get(userId) as
    { id: string; name: string; role: string } | undefined;
  if (!user) return err('user not found', 404);
  const { quota, usage } = quotaWithUsage(userId);
  return json({ ok: true, userId, name: user.name, role: user.role, quota, usage });
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
  const [admin, e] = await requireAdmin();
  if (e) return e;
  const { userId } = await ctx.params;

  const rd = rawDb();
  const user = rd.prepare(`select id, name from users where id = ?`).get(userId) as
    { id: string; name: string } | undefined;
  if (!user) return err('user not found', 404);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  /** Parse a quota bound. null => unlimited, 0 => none. */
  const bound = (v: unknown, name: string): number | null | undefined => {
    if (v === undefined || v === '') return undefined; // leave as-is
    if (v === null || v === 'unlimited') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error(`${name} must be a whole number, 0, or null for unlimited`);
    }
    return n;
  };

  let vms: number | null | undefined;
  let vcpus: number | null | undefined;
  let mem: number | null | undefined;
  let disk: number | null | undefined;
  let running: number | null | undefined;
  try {
    vms = bound(body.maxVms, 'maxVms');
    vcpus = bound(body.maxVcpus, 'maxVcpus');
    mem = bound(body.maxMemoryMb, 'maxMemoryMb');
    disk = bound(body.maxDiskGb, 'maxDiskGb');
    running = bound(body.maxRunning, 'maxRunning');
  } catch (err2) {
    return err((err2 as Error).message, 400);
  }
  const suspended = body.suspended === true || body.suspended === 'true' ? 1
    : body.suspended === false || body.suspended === 'false' ? 0 : undefined;
  const note = typeof body.note === 'string' ? body.note.slice(0, 300) : undefined;

  // A user may have a LOWERED quota below what they already use. That is legal
  // (they keep what they have, they just cannot grow), but it must be visible
  // rather than silently discovered when their next create fails.
  const existing = rd.prepare(`select * from quotas where user_id = ?`).get(userId) as Record<string, unknown> | undefined;
  const merged = {
    max_vms: vms !== undefined ? vms : (existing?.max_vms as number | null) ?? null,
    max_vcpus: vcpus !== undefined ? vcpus : (existing?.max_vcpus as number | null) ?? null,
    max_memory_mb: mem !== undefined ? mem : (existing?.max_memory_mb as number | null) ?? null,
    max_disk_gb: disk !== undefined ? disk : (existing?.max_disk_gb as number | null) ?? null,
    max_running: running !== undefined ? running : (existing?.max_running as number | null) ?? null,
    suspended: suspended !== undefined ? suspended : Number(existing?.suspended ?? 0),
    note: note !== undefined ? note : (existing?.note as string | null) ?? null,
  };

  rd.prepare(
    `insert into quotas (user_id, max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running, suspended, note, updated_at)
     values (?,?,?,?,?,?,?,?,?)
     on conflict(user_id) do update set
       max_vms=excluded.max_vms, max_vcpus=excluded.max_vcpus,
       max_memory_mb=excluded.max_memory_mb, max_disk_gb=excluded.max_disk_gb,
       max_running=excluded.max_running, suspended=excluded.suspended,
       note=excluded.note, updated_at=excluded.updated_at`,
  ).run(userId, merged.max_vms, merged.max_vcpus, merged.max_memory_mb, merged.max_disk_gb,
    merged.max_running, merged.suspended, merged.note, now());

  await logAudit({
    actorId: admin.id, actorName: admin.name, action: 'quota.set', target: userId,
    detail: merged as unknown as Record<string, unknown>,
  });

  const { quota, usage } = quotaWithUsage(userId);
  return json({ ok: true, userId, quota, usage });
}

export const dynamic = 'force-dynamic';