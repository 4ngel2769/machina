import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { enqueue } from '@/lib/core/jobs';
import { now } from '@/lib/core/util';
import { decrypt } from '@/lib/core/crypto';
import { bandState } from '@/lib/core/netmeter';
import { logAudit } from '@/lib/services/audit';
import { friendlyStep } from '@/lib/core/errors';

type Ctx = { params: Promise<{ id: string }> };

/** Manual retry for a failed provisioning. Requeues the create job with its
 *  attempt budget reset (the self-heal counter starts over too), after
 *  clearing the artifacts a dead attempt leaves behind. */
async function retryProvisioning(
  user: { id: string; name: string },
  inst: { id: string; userId: string; status: string; planId: string; imageId: string },
) {
  const rd = rawDb();
  if (!['error', 'provisioning'].includes(inst.status)) {
    return err(`nothing to retry — instance is ${inst.status}`, 409);
  }
  const active = rd.prepare(`select 1 from jobs where instance_id=? and status in ('queued','running')`).get(inst.id);
  if (active) return err('a job is already running for this instance', 409);

  const row = rd.prepare(`select domain_name from instances where id=?`).get(inst.id) as { domain_name: string } | undefined;
  if (row) {
    const { destroyDomain, undefineDomain } = await import('@/lib/core/driver');
    await destroyDomain(row.domain_name).catch(() => {});
    await undefineDomain(row.domain_name).catch(() => {});
  }
  const { diskVolFromId } = await import('@/lib/core/disks');
  const { storagePaths } = await import('@/lib/config');
  const fsp = await import('fs/promises');
  const sp = storagePaths();
  await fsp.rm(`${sp.vms}/${diskVolFromId(inst.id)}.qcow2`, { force: true }).catch(() => {});
  await fsp.rm(`${sp.seeds}/${inst.id}/seed.iso`, { force: true }).catch(() => {});

  const failed = rd.prepare(`select id from jobs where instance_id=? and type='instance.create'`).get(inst.id) as { id: string } | undefined;
  if (failed) {
    rd.prepare(`update jobs set status='queued', attempts=0, run_after=0, error='' where id=?`).run(failed.id);
  } else {
    await enqueue({ type: 'instance.create', instanceId: inst.id, userId: inst.userId, payload: {} });
  }
  rd.prepare(`update instances set status='provisioning', heal_count=0, updated_at=? where id=?`).run(now(), inst.id);
  await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.retry', target: inst.id });
  return json({ ok: true, action: 'retry', note: 'provisioning restarted — expect 60–90s' });
}

async function load(id: string, userId: string, role: string) {
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return [null, err('not found', 404)] as const;
  if (inst.userId !== userId && role !== 'admin') return [null, err('forbidden', 403)] as const;
  return [inst, null] as const;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, e] = await load(id, user.id, user.role);
  if (e) return e;
  // camelCase the job rows (raw SQL returns snake_case; the detail page reads
  // createdAt, and snake_case silently produced "Invalid Date" on screen).
  const jobs = (rawDb().prepare(
    `select id, type, instance_id as instanceId, status, error, created_at as createdAt,
            started_at as startedAt, finished_at as finishedAt
     from jobs where instance_id=? order by created_at desc limit 10`).all(id)) as Array<{
    id: string; type: string; status: string; error: string; createdAt: number;
    startedAt: number | null; finishedAt: number | null;
  }>;

  // one readable line for the UI instead of raw tool output
  const active = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  const activeRow = active
    ? rawDb().prepare(`select log from jobs where id=?`).get(active.id) as { log: string } | undefined
    : undefined;
  const step = active ? friendlyStep(activeRow?.log ?? '') : '';
  const lastFailed = jobs.find((j) => j.status === 'failed');
  return json({
    ...inst,
    rootPassEnc: undefined,
    vncPass: undefined, // drizzle key is camelCase; the leaked VNC password is NOT a feature
    rootPassword: inst.rootPassEnc ? decrypt(inst.rootPassEnc) : null, // owner/admin session only
    bw: bandState(inst.id, inst.bandwidthGb ?? 0),
    step,
    problem: inst.status === 'error' || lastFailed ? (lastFailed?.error || 'provisioning failed') : null,
    healCount: inst.healCount ?? 0,
    // structured lines for the live log viewer: one entry per step already
    // taken, newest last, each with a readable message
    logLines: logLines(active?.id ?? lastFailed?.id ?? jobs[0]?.id),
    jobs,
  });
}

type LogLine = { t: number; m: string; kind: 'step' | 'ok' | 'err' | 'info' };

/** Parse a job log into friendly, animated lines for the UI. Raw text stays in
 *  the DB; this is what a person actually wants to read while waiting. */
function logLines(jobId?: string): LogLine[] {
  if (!jobId) return [];
  const row = rawDb().prepare(`select log, status, error, finished_at, started_at, created_at from jobs where id=?`).get(jobId) as
    | { log: string; status: string; error: string; finished_at: number | null; started_at: number | null; created_at: number } | undefined;
  if (!row) return [];
  const out: LogLine[] = [];
  const seen = new Set<number>();
  for (const rawLine of String(row.log ?? '').split('\n')) {
    const m = rawLine.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!m) continue;
    const t = Date.parse(m[1]);
    const text = m[2].trim();
    if (!text || seen.has(t)) continue;
    seen.add(t);
    if (/^FAILED:/.test(text)) continue; // rendered separately as the error
    out.push({ t, m: friendlyStepLine(text), kind: stepKind(text) });
  }
  // The terminal line carries the job's REAL end time. Date.now() here was
  // wrong: it stamped the failure with whenever the page was next opened,
  // which made a 2-minute failure look like a 10-hour hang.
  const endT = row.finished_at ?? row.started_at ?? row.created_at;
  if (row.status === 'done') out.push({ t: endT, m: 'finished successfully', kind: 'ok' });
  if (row.status === 'failed' && row.error) out.push({ t: endT, m: row.error, kind: 'err' });
  return out.slice(-40);
}

function friendlyStepLine(text: string): string {
  const s = friendlyStep(text);
  return s === 'working' ? text.replace(/\.$/, '') : s;
}

function stepKind(text: string): 'step' | 'ok' | 'err' | 'info' {
  if (/running|started|done|ok|created|reserved|registered/i.test(text)) return 'ok';
  if (/waiting|cleaning|settling|writing/i.test(text)) return 'info';
  if (/delete|destroy|remov/i.test(text)) return 'err';
  return 'step';
}

/** lifecycle actions: start | stop | delete */
export async function POST(req: NextRequest, ctx: Ctx) {
  const g = guardMutation(req);
  if (g) return g;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, e] = await load(id, user.id, user.role);
  if (e) return e;
  const body = (await req.json().catch(() => ({}))) as { action?: string; force?: boolean };
  const action = body.action;
  if (action === 'retry') return retryProvisioning(user, inst);
  if (action !== 'start' && action !== 'stop' && action !== 'delete') return err('unknown action');
  const status = inst.status;
  if (status === 'provisioning') return err('instance still provisioning', 409);
  const needsRunning = action === 'start' ? ['stopped', 'suspended', 'error'] : ['running', 'suspended', 'error'];
  if (action === 'start' && !needsRunning.includes(status)) return err(`cannot start from ${status}`, 409);
  if (action !== 'start' && !needsRunning.includes(status)) {
    if (action === 'delete' && ['stopped', 'suspended', 'error'].includes(status)) {
      // delete from stopped state is legitimate
    } else {
      return err(`cannot ${action} a ${status} instance`, 409);
    }
  }
  const active = rawDb().prepare(
    `select 1 from jobs where instance_id=? and status in ('queued','running')`,
  ).get(id);
  if (active) return err('a job is already in flight for this instance', 409);

  await logAudit({ actorId: user.id, actorName: user.name, action: `instance.${action}`, target: id });
  if (action === 'delete') {
    await enqueue({ type: 'instance.delete', instanceId: id, userId: inst.userId });
    return json({ ok: true, action, note: 'deleting: settle, destroy, cleanup' });
  }
  await enqueue({
    type: action === 'start' ? 'instance.start' : 'instance.stop',
    instanceId: id,
    userId: inst.userId,
    payload: { force: Boolean(body.force) },
  });
  return json({ ok: true, action });
}

export const dynamic = 'force-dynamic';
