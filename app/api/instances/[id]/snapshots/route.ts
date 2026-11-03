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
  ).all(id) as { id: string; name: string; description: string; state: string; sizeBytes: number; current: number; createdAt: number }[];

  let live: Awaited<ReturnType<typeof listSnapshots>> = [];
  try {
    live = await listSnapshots(inst.domainName);
  } catch {
    // Domain is gone or libvirt is unhappy. Report what we still know rather
    // than a hard error: the tenant can still see and act on their list.
  }

  // libvirt 10 exposes no per-snapshot disk delta, so the honest number to
  // show is what the overlay actually occupies (guest data + snapshot copy-on-
  // write blocks). That is also the figure the quota checks against.
  let disk: { actualBytes: number; virtualBytes: number; freeMb: number } | null = null;
  try {
    const { diskUsage } = await import('@/lib/core/driver');
    const { diskVolFromId } = await import('@/lib/core/disks');
    disk = await diskUsage(diskVolFromId(inst.id));
  } catch {
    disk = null;
  }

  const byName = new Map<string, (typeof indexed)[number]>(indexed.map((r) => [r.name, r]));
  const merged = live.map((s) => {
    const row = byName.get(s.name);
    return {
      id: row?.id ?? '',
      name: s.name,
      description: row?.description ?? s.description ?? '',
      state: s.state,
      sizeBytes: s.sizeBytes || row?.sizeBytes || 0,
      current: s.isCurrent,
      createdAt: s.createdAt || row?.createdAt || 0,
      // True when libvirt still holds it but our index lost the row.
      orphaned: !row,
    };
  });
  // Indexed rows with no libvirt counterpart: the snapshot is gone (deleted
  // out of band). Say so rather than pretending it is still restorable.
  for (const row of indexed) {
    if (!live.some((s) => s.name === row.name)) {
      merged.push({ ...row, state: 'missing', current: false, orphaned: true });
    }
  }
  merged.sort((a, b) => b.createdAt - a.createdAt);

  return json({
    ok: true,
    snapshots: merged,
    live: live.length > 0,
    running: inst.status === 'running',
    disk,
    planDiskGb: planDiskGb(inst.id),
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, e] = await load(id, user.id, user.role);
  if (e) return e;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    name?: string;
    description?: string;
    mode?: string;
  };
  const action = body.action;
  if (!['create', 'revert', 'delete'].includes(action ?? '')) return err('unknown action');

  // Validate before anything else so a hostile name never reaches a log line,
  // an audit row, or libvirt.
  let name: string;
  try {
    name = assertSnapshotName(body.name ?? '');
  } catch (err2) {
    return err((err2 as Error).message, 400);
  }

  if (action === 'create' && inst.status === 'provisioning') {
    return err('instance is still provisioning', 409);
  }
  if (action === 'revert' && inst.status === 'provisioning') {
    return err('instance is still provisioning', 409);
  }

  const rd = rawDb();
  // One job at a time per instance: the worker is single-flight per instance
  // and two concurrent snapshot ops on one qcow2 will corrupt the metadata.
  const active = rd.prepare(
    `select 1 from jobs where instance_id=? and status in ('queued','running')`,
  ).get(id);
  if (active) return err('another job is already running for this instance', 409);

  if (action === 'create') {
    const dupe = rd.prepare(`select 1 from snapshots where instance_id=? and name=?`).get(id, name);
    if (dupe) return err(`a snapshot named "${name}" already exists`, 409);
  } else {
    // libvirt is the source of truth, not our index. A snapshot taken out of
    // band (or restored from a backup) is absent from the table but present in
    // the domain, and the list already shows it — refusing to act on it because
    // of a bookkeeping gap would be a lie told in both directions.
    let exists = false;
    try {
      exists = (await listSnapshots(inst.domainName)).some((s) => s.name === name);
    } catch {
      exists = Boolean(rd.prepare(`select 1 from snapshots where instance_id=? and name=?`).get(id, name));
    }
    if (!exists) return err(`no snapshot named "${name}"`, 404);
  }

  await logAudit({
    actorId: user.id, actorName: user.name,
    action: `instance.snapshot.${action}`, target: id,
    detail: { name, mode: body.mode },
  });

  if (action === 'create') {
    await enqueue({
      type: 'instance.snapshot', instanceId: id, userId: inst.userId,
      payload: { name, description: (body.description ?? '').slice(0, 200) },
    });
    return json({ ok: true, action, name, note: 'taking the snapshot now' });
  }
  if (action === 'revert') {
    const mode = body.mode === 'live' ? 'live' : 'clean';
    await enqueue({
      type: 'instance.snapshot-revert', instanceId: id, userId: inst.userId,
      payload: { name, mode },
    });
    return json({
      ok: true, action, name,
      note: mode === 'clean'
        ? 'shutting down, rolling the disk back, starting again'
        : 'rolling the disk back under the running guest (like a power cut)',
    });
  }
  await enqueue({
    type: 'instance.snapshot-delete', instanceId: id, userId: inst.userId, payload: { name },
  });
  return json({ ok: true, action, name, note: `deleting snapshot "${name}"` });
}

export const dynamic = 'force-dynamic';