/**
 * Snapshot list, create, revert and delete for one instance.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { rawDb, getDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { enqueue } from '@/lib/core/jobs';
import { logAudit } from '@/lib/services/audit';
import { listSnapshots, assertSnapshotName } from '@/lib/core/driver';

type Ctx = { params: Promise<{ id: string }> };

/** Ownership is re-read from the DB on every call. Never trust an id from the
 *  request body or a client-held claim about who owns a VM. */
async function load(id: string, userId: string, role: string) {
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return [null, err('not found', 404)] as const;
  if (inst.userId !== userId && role !== 'admin') return [null, err('forbidden', 403)] as const;
  return [inst, null] as const;
}

/** The plan's disk size, used to show the tenant how close they are to the
 *  growth ceiling that stops snapshot creation. */
function planDiskGb(id: string): number {
  const r = rawDb().prepare(
    `select p.disk_gb as g from instances i join plans p on p.id = i.plan_id where i.id=?`,
  ).get(id) as { g: number } | undefined;
  return r?.g ?? 0;
}

type IndexedSnap = { id: string; name: string; description: string; state: string; sizeBytes: number; current: number; createdAt: number };
type LiveSnap = Awaited<ReturnType<typeof listSnapshots>>[number];

/** libvirt 10 exposes no per-snapshot disk delta, so the honest number to
 *  show is what the overlay actually occupies (guest data + snapshot copy-on-
 *  write blocks). That is also the figure the quota checks against. */
async function diskUsageFor(instId: string) {
  try {
    const { diskUsage } = await import('@/lib/core/driver');
    const { diskVolFromId } = await import('@/lib/core/disks');
    return await diskUsage(diskVolFromId(instId));
  } catch {
    return null;
  }
}

/** First non-nullish value wins (?? semantics: '' and 0 are real values). */
function firstDefined<T>(...vals: (T | null | undefined)[]): T {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return vals[vals.length - 1] as T;
}

/** First truthy value wins (|| semantics: 0 and '' fall through). */
function firstTruthy<T>(...vals: (T | null | undefined | false | 0 | '')[]): T {
  for (const v of vals) if (v) return v as T;
  return vals[vals.length - 1] as T;
}

/** One libvirt snapshot merged with its index row; orphaned when the index
 *  lost the row (taken out of band, or after a restore). */
function mergeSnap(s: LiveSnap, row: IndexedSnap | undefined) {
  return {
    id: row?.id ?? '',
    name: s.name,
    description: firstDefined<string>(row?.description, s.description, ''),
    state: s.state,
    sizeBytes: firstTruthy<number>(s.sizeBytes, row?.sizeBytes, 0),
    current: s.isCurrent,
    createdAt: firstTruthy<number>(s.createdAt, row?.createdAt, 0),
    // True when libvirt still holds it but our index lost the row.
    orphaned: !row,
  };
}

/** Indexed rows with no libvirt counterpart: the snapshot is gone (deleted
 *  out of band). Say so rather than pretending it is still restorable. */
function missingSnaps(indexed: IndexedSnap[], live: LiveSnap[]) {
  return indexed
    .filter((row) => !live.some((s) => s.name === row.name))
    .map((row) => ({ ...row, state: 'missing', current: false, orphaned: true }));
}

/** Snapshot list: libvirt is the source of truth, our table is the index.
 *  Merged so a snapshot that exists in libvirt but not our table (e.g. taken
 *  out of band, or after a restore) still shows up rather than vanishing. */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, e] = await load(id, user.id, user.role);
  if (e) return e;

  const rd = rawDb();
  const indexed = rd.prepare(
    `select id, name, description, state, size_bytes as sizeBytes, current, created_at as createdAt
     from snapshots where instance_id=? order by created_at desc`,
  ).all(id) as IndexedSnap[];

  let live: LiveSnap[] = [];
  try {
    live = await listSnapshots(inst.domainName);
  } catch {
    // Domain is gone or libvirt is unhappy. Report what we still know rather
    // than a hard error: the tenant can still see and act on their list.
  }

  const byName = new Map<string, IndexedSnap>(indexed.map((r) => [r.name, r]));
  const merged = [
    ...live.map((s) => mergeSnap(s, byName.get(s.name))),
    ...missingSnaps(indexed, live),
  ];
  merged.sort((a, b) => b.createdAt - a.createdAt);

  return json({
    ok: true,
    snapshots: merged,
    live: live.length > 0,
    running: inst.status === 'running',
    disk: await diskUsageFor(inst.id),
    planDiskGb: planDiskGb(inst.id),
  });
}

type SnapBody = { action?: string; name?: string; description?: string; mode?: string };

function snapshotActionCheck(action: string | undefined, status: string) {
  if (!['create', 'revert', 'delete'].includes(action ?? '')) return err('unknown action');
  if ((action === 'create' || action === 'revert') && status === 'provisioning') {
    return err('instance is still provisioning', 409);
  }
  return null;
}

function validSnapName(body: SnapBody) {
  try {
    return { name: assertSnapshotName(body.name ?? '') };
  } catch (err2) {
    return { refused: err((err2 as Error).message, 400) };
  }
}

/** libvirt is the source of truth, not our index. A snapshot taken out of
 *  band (or restored from a backup) is absent from the table but present in
 *  the domain, and the list already shows it — refusing to act on it because
 *  of a bookkeeping gap would be a lie told in both directions. */
async function snapshotExists(inst: { domainName: string }, id: string, name: string) {
  try {
    return (await listSnapshots(inst.domainName)).some((s) => s.name === name);
  } catch {
    return Boolean(rawDb().prepare(`select 1 from snapshots where instance_id=? and name=?`).get(id, name));
  }
}

async function snapshotTargetCheck(action: string, inst: { domainName: string; id: string }, id: string, name: string) {
  if (action === 'create') {
    const dupe = rawDb().prepare(`select 1 from snapshots where instance_id=? and name=?`).get(id, name);
    if (dupe) return err(`a snapshot named "${name}" already exists`, 409);
    return null;
  }
  if (!(await snapshotExists(inst, id, name))) return err(`no snapshot named "${name}"`, 404);
  return null;
}

function snapshotDispatch(action: string, inst: { id: string; userId: string }, id: string, name: string, body: SnapBody) {
  if (action === 'create') {
    return enqueue({
      type: 'instance.snapshot', instanceId: id, userId: inst.userId,
      payload: { name, description: (body.description ?? '').slice(0, 200) },
    }).then(() => json({ ok: true, action, name, note: 'taking the snapshot now' }));
  }
  if (action === 'revert') {
    const mode = body.mode === 'live' ? 'live' : 'clean';
    return enqueue({
      type: 'instance.snapshot-revert', instanceId: id, userId: inst.userId,
      payload: { name, mode },
    }).then(() => json({
      ok: true, action, name,
      note: mode === 'clean'
        ? 'shutting down, rolling the disk back, starting again'
        : 'rolling the disk back under the running guest (like a power cut)',
    }));
  }
  return enqueue({
    type: 'instance.snapshot-delete', instanceId: id, userId: inst.userId, payload: { name },
  }).then(() => json({ ok: true, action, name, note: `deleting snapshot "${name}"` }));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, e] = await load(id, user.id, user.role);
  if (e) return e;

  const body = (await req.json().catch(() => ({}))) as SnapBody;
  const action = body.action ?? '';
  const refusedAction = snapshotActionCheck(action, inst.status);
  if (refusedAction) return refusedAction;

  // Validate before anything else so a hostile name never reaches a log line,
  // an audit row, or libvirt.
  const named = validSnapName(body);
  if ('refused' in named) return named.refused;
  const name = named.name;

  const rd = rawDb();
  // One job at a time per instance: the worker is single-flight per instance
  // and two concurrent snapshot ops on one qcow2 will corrupt the metadata.
  const active = rd.prepare(
    `select 1 from jobs where instance_id=? and status in ('queued','running')`,
  ).get(id);
  if (active) return err('another job is already running for this instance', 409);

  const refusedTarget = await snapshotTargetCheck(action, inst, id, name);
  if (refusedTarget) return refusedTarget;

  await logAudit({
    actorId: user.id, actorName: user.name,
    action: `instance.snapshot.${action}`, target: id,
    detail: { name, mode: body.mode },
  });

  return snapshotDispatch(action, inst, id, name, body);
}

export const dynamic = 'force-dynamic';
