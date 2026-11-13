/**
 * One account's quota: read it, edit it, and read the usage behind it.
 */
import { NextRequest } from 'next/server';
import { json, err, guardMutation, requireAdmin, jsonBody } from '@/lib/api';
import { z } from 'zod';
import { rawDb } from '@/lib/db';
import { quotaWithUsage } from '@/lib/core/quota';
import { now } from '@/lib/core/util';
import { logAudit } from '@/lib/services/audit';

type Ctx = { params: Promise<{ userId: string }> };

/** All users with their quota and live usage. Admin only: this is the whole
 *  capacity picture and every row is a customer. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { userId } = await ctx.params;
  const raw = rawDb();
  const user = raw.prepare(`select id, name, role from users where id = ?`).get(userId) as
    { id: string; name: string; role: string } | undefined;
  if (!user) return err('user not found', 404);
  const { quota, usage } = quotaWithUsage(userId);
  return json({ ok: true, userId, name: user.name, role: user.role, quota, usage });
}

type QuotaRow = Record<string, unknown> | undefined;

/** Parse a quota bound. null => unlimited, 0 => none. */
function bound(raw: unknown, name: string): number | null | undefined {
  if (raw === undefined || raw === '') return undefined; // leave as-is
  if (raw === null || raw === 'unlimited') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${name} must be a whole number, 0, or null for unlimited`);
  }
  return parsed;
}

type Bounds = {
  vms?: number | null; vcpus?: number | null; mem?: number | null;
  disk?: number | null; running?: number | null;
  isoCount?: number | null; isoTotalGb?: number | null;
  containers?: number | null; containerMemMb?: number | null; containerCpus?: number | null;
};

function parseBounds(body: Record<string, unknown>): Bounds | ReturnType<typeof err> {
  try {
    return {
      vms: bound(body.maxVms, 'maxVms'),
      vcpus: bound(body.maxVcpus, 'maxVcpus'),
      mem: bound(body.maxMemoryMb, 'maxMemoryMb'),
      disk: bound(body.maxDiskGb, 'maxDiskGb'),
      running: bound(body.maxRunning, 'maxRunning'),
      isoCount: bound(body.maxIsoCount, 'maxIsoCount'),
      isoTotalGb: bound(body.maxIsoTotalGb, 'maxIsoTotalGb'),
      containers: bound(body.maxContainers, 'maxContainers'),
      containerMemMb: bound(body.maxContainerMemMb, 'maxContainerMemMb'),
      // cpus allow fractional values, so they get their own parser.
      containerCpus: boundCpus(body.maxContainerCpus),
    };
  } catch (parseError) {
    return err((parseError as Error).message, 400);
  }
}

/** vCPU bounds are fractional: null = unlimited, 0 = none, else a positive number. */
function boundCpus(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (raw === null || raw === 'unlimited') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 64) {
    throw new Error('maxContainerCpus must be a number 0-64, or null for unlimited');
  }
  return parsed;
}

function suspendedFlag(raw: unknown) {
  if (raw === true || raw === 'true') return 1;
  if (raw === false || raw === 'false') return 0;
  return undefined;
}

function noteText(raw: unknown) {
  return typeof raw === 'string' ? raw.slice(0, 300) : undefined;
}

/** Field-by-field merge: an absent field keeps the stored value, an explicit
 *  null means unlimited and 0 means none. */
function mergeQuota(bounds: Bounds, suspended: number | undefined, note: string | undefined, existing: QuotaRow) {
  const pick = (value: number | null | undefined, col: string) =>
    value !== undefined ? value : (existing?.[col] as number | null) ?? null;
  return {
    max_vms: pick(bounds.vms, 'max_vms'),
    max_vcpus: pick(bounds.vcpus, 'max_vcpus'),
    max_memory_mb: pick(bounds.mem, 'max_memory_mb'),
    max_disk_gb: pick(bounds.disk, 'max_disk_gb'),
    max_running: pick(bounds.running, 'max_running'),
    max_iso_count: pick(bounds.isoCount, 'max_iso_count'),
    max_iso_total_gb: pick(bounds.isoTotalGb, 'max_iso_total_gb'),
    max_containers: pick(bounds.containers, 'max_containers'),
    max_container_mem_mb: pick(bounds.containerMemMb, 'max_container_mem_mb'),
    max_container_cpus: pick(bounds.containerCpus, 'max_container_cpus'),
    suspended: suspended !== undefined ? suspended : Number(existing?.suspended ?? 0),
    note: note !== undefined ? note : (existing?.note as string | null) ?? null,
  };
}

function writeQuota(userId: string, merged: ReturnType<typeof mergeQuota>) {
  rawDb().prepare(
    `insert into quotas (user_id, max_vms, max_vcpus, max_memory_mb, max_disk_gb, max_running,
                         max_iso_count, max_iso_total_gb, max_containers, max_container_mem_mb, max_container_cpus,
                         suspended, note, updated_at)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     on conflict(user_id) do update set
       max_vms=excluded.max_vms, max_vcpus=excluded.max_vcpus,
       max_memory_mb=excluded.max_memory_mb, max_disk_gb=excluded.max_disk_gb,
       max_running=excluded.max_running,
       max_iso_count=excluded.max_iso_count, max_iso_total_gb=excluded.max_iso_total_gb,
       max_containers=excluded.max_containers,
       max_container_mem_mb=excluded.max_container_mem_mb, max_container_cpus=excluded.max_container_cpus,
       suspended=excluded.suspended,
       note=excluded.note, updated_at=excluded.updated_at`,
  ).run(userId, merged.max_vms, merged.max_vcpus, merged.max_memory_mb, merged.max_disk_gb,
    merged.max_running, merged.max_iso_count, merged.max_iso_total_gb, merged.max_containers,
    merged.max_container_mem_mb, merged.max_container_cpus, merged.suspended, merged.note, now());
}

/**
 * Set a user's quota.
 *
 * Quota fields accept a number, or null for unlimited, or 0 for "none". An
 * empty string means "leave this one alone" so a client can PATCH one field
 * without having to re-send the rest and risk clobbering them.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const deniedMutation = guardMutation(req);
  if (deniedMutation) return deniedMutation;
  const { user: admin, response: denied } = await requireAdmin();
  if (denied) return denied;
  const { userId } = await ctx.params;

  const raw = rawDb();
  const user = raw.prepare(`select id, name from users where id = ?`).get(userId) as
    { id: string; name: string } | undefined;
  if (!user) return err('user not found', 404);

  const body = await jsonBody(req, z.object({}).passthrough());
  const parsed = parseBounds(body);
  if (parsed instanceof Response) return parsed;

  // A user may have a LOWERED quota below what they already use. That is legal
  // (they keep what they have, they just cannot grow), but it must be visible
  // rather than silently discovered when their next create fails.
  const existing = raw.prepare(`select * from quotas where user_id = ?`).get(userId) as QuotaRow;
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
