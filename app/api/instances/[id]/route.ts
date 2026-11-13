/**
 * Instance detail, lifecycle actions and provisioning retry.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation } from '@/lib/api';
import { getDb, rawDb } from '@/lib/db';
import { instances, plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import { enqueue } from '@/lib/core/jobs';
import { now } from '@/lib/core/util';
import { decrypt } from '@/lib/core/crypto';
import { bandState } from '@/lib/core/netmeter';
import { logAudit } from '@/lib/services/audit';
import { friendlyStep, friendlyError } from '@/lib/core/errors';
import { provisionInstance } from '@/lib/core/provision';
import { diskVolFromId } from '@/lib/core/disks';
import { storagePaths } from '@/lib/config';
import { logJobLines } from './log-lines';

type Ctx = { params: Promise<{ id: string }> };

/** Manual retry for a failed provisioning. Requeues the create job with its
 *  attempt budget reset (the self-heal counter starts over too), after
 *  clearing the artifacts a dead attempt leaves behind. */
async function retryProvisioning(
  user: { id: string; name: string },
  inst: { id: string; userId: string; status: string; planId: string; imageId: string },
) {
  const raw = rawDb();
  if (!['error', 'provisioning'].includes(inst.status)) {
    return err(`nothing to retry — instance is ${inst.status}`, 409);
  }
  const active = raw.prepare(`select 1 from jobs where instance_id=? and status in ('queued','running')`).get(inst.id);
  if (active) return err('a job is already running for this instance', 409);

  const domainRow = raw.prepare(`select domain_name from instances where id=?`).get(inst.id) as { domain_name: string } | undefined;
  if (domainRow) {
    const { destroyDomain, undefineDomain } = await import('@/lib/core/driver');
    await destroyDomain(domainRow.domain_name).catch(() => {});
    await undefineDomain(domainRow.domain_name).catch(() => {});
  }
  const { diskVolFromId } = await import('@/lib/core/disks');
  const { storagePaths } = await import('@/lib/config');
  const fsPromises = await import('fs/promises');
  const storage = storagePaths();
  await fsPromises.rm(`${storage.vms}/${diskVolFromId(inst.id)}.qcow2`, { force: true }).catch(() => {});
  await fsPromises.rm(`${storage.seeds}/${inst.id}/seed.iso`, { force: true }).catch(() => {});

  const failedJob = raw.prepare(`select id from jobs where instance_id=? and type='instance.create'`).get(inst.id) as { id: string } | undefined;
  if (failedJob) {
    raw.prepare(`update jobs set status='queued', attempts=0, run_after=0, error='' where id=?`).run(failedJob.id);
  } else {
    await enqueue({ type: 'instance.create', instanceId: inst.id, userId: inst.userId, payload: {} });
  }
  raw.prepare(`update instances set status='provisioning', heal_count=0, updated_at=? where id=?`).run(now(), inst.id);
  await logAudit({ actorId: user.id, actorName: user.name, action: 'instance.retry', target: inst.id });
  return json({ ok: true, action: 'retry', note: 'provisioning restarted — expect 60–90s' });
}

/**
 * Clone goes through provisionInstance(), not a second row-creation path: the
 * new VM needs its own IP, MAC, seed, quota reservation, billing rate and job,
 * and every one of those already lives there. The only thing that differs is
 * where the disk comes from.
 */
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,40}$/;

async function cloneInstance(
  user: { id: string; name: string; role: string },
  inst: { id: string; userId: string; status: string; planId: string; imageId: string },
  body: { name?: string; planId?: string },
) {
  if (inst.status === 'running' || inst.status === 'paused') {
    return err('stop the VM before cloning: a copy of a live disk is only crash-consistent', 409);
  }
  if (!['stopped', 'suspended', 'error'].includes(inst.status)) {
    return err(`cannot clone a ${inst.status} instance`, 409);
  }
  const name = String(body.name ?? '').trim();
  if (!NAME_RE.test(name)) return err('name must be 3-41 characters: letters, digits, dot, dash, underscore', 400);

  const active = rawDb().prepare(
    `select 1 from jobs where instance_id=? and status in ('queued','running')`,
  ).get(inst.id);
  if (active) return err('a job is already in flight for this instance', 409);

  const sourceDisk = `${storagePaths().vms}/${diskVolFromId(inst.id)}.qcow2`;
  if (!fs.existsSync(sourceDisk)) return err('the source disk is missing, so there is nothing to copy', 409);

  try {
    const created = await provisionInstance({
      userId: user.id,
      name,
      planId: String(body.planId ?? inst.planId),
      imageId: inst.imageId,
      actorName: user.name,
      actorRole: user.role,
      copyFromPath: sourceDisk,
    });
    await logAudit({
      actorId: user.id, actorName: user.name, action: 'instance.clone', target: created.id,
      detail: { from: inst.id, name: created.name },
    });
    return json({ ok: true, action: 'clone', id: created.id, name: created.name, ip: created.ip, note: 'cloning — expect 60–90s' });
  } catch (error) {
    return err(friendlyError(error), 400);
  }
}

async function load(id: string, userId: string, role: string) {
  const [inst] = await getDb().select().from(instances).where(eq(instances.id, id));
  if (!inst) return [null, err('not found', 404)] as const;
  if (inst.userId !== userId && role !== 'admin') return [null, err('forbidden', 403)] as const;
  return [inst, null] as const;
}

/** The state machine for start/stop/delete, or the refusal response. */
function lifecycleRefusal(action: string | undefined, status: string) {
  if (action !== 'start' && action !== 'stop' && action !== 'delete') return err('unknown action');
  if (status === 'provisioning') return err('instance still provisioning', 409);
  if (action === 'start') {
    if (!['stopped', 'suspended', 'error'].includes(status)) return err(`cannot start from ${status}`, 409);
    return null;
  }
  const allowed = ['running', 'suspended', 'error'];
  // delete from a stopped state is legitimate; stop is not.
  const canTransition = action === 'delete' && ['stopped', 'suspended', 'error'].includes(status)
    ? true
    : allowed.includes(status);
  if (!canTransition) return err(`cannot ${action} a ${status} instance`, 409);
  return null;
}

type JobRow = {
  id: string; type: string; status: string; error: string; createdAt: number;
  startedAt: number | null; finishedAt: number | null;
};

/** The job-log lines for whichever job matters most: the live one, else the
 *  last failure, else the newest job at all. */
function pickLogJob(jobs: JobRow[]) {
  const active = jobs.find((job) => job.status === 'running' || job.status === 'queued');
  const lastFinished = jobs.find((job) => job.status === 'done' || job.status === 'failed');
  const lastFailed = lastFinished?.status === 'failed' ? lastFinished : undefined;
  return { active, lastFailed };
}

/** One readable line for the UI instead of raw tool output. */
function stepLine(active: JobRow | undefined) {
  if (!active) return '';
  const activeRow = rawDb().prepare(`select log from jobs where id=?`).get(active.id) as { log: string } | undefined;
  return friendlyStep(activeRow?.log ?? '');
}

/** camelCase the job rows (raw SQL returns snake_case; the detail page reads
 *  createdAt, and snake_case silently produced "Invalid Date" on screen). */
function loadJobs(id: string): JobRow[] {
  return (rawDb().prepare(
    `select id, type, instance_id as instanceId, status, error, created_at as createdAt,
            started_at as startedAt, finished_at as finishedAt
     from jobs where instance_id=? order by created_at desc limit 10`).all(id)) as JobRow[];
}

/** The plan's display name and specs, because a custom plan's id is a hash
 *  ("custom-7e7c3449") and that is all a reader would otherwise see. */
async function planInfo(planId: string) {
  return (await getDb().select({ name: plans.name, vcpu: plans.vcpu, ramMb: plans.ramMb, diskGb: plans.diskGb })
    .from(plans).where(eq(plans.id, planId)))[0] ?? null;
}

/** structured lines for the live log viewer: one entry per step already
 *  taken, newest last, each with a readable message */
function logJobId(active: JobRow | undefined, lastFailed: JobRow | undefined, jobs: JobRow[]) {
  return active?.id ?? lastFailed?.id ?? jobs[0]?.id;
}

/** The detail-page payload: instance row plus jobs, live step and log lines. */
async function instancePayload(inst: {
  id: string; planId: string; status: string; rootPassEnc: string | null;
  bandwidthGb: number | null; healCount: number | null;
}, jobs: JobRow[]) {
  const { active, lastFailed } = pickLogJob(jobs);
  // A failure is only a CURRENT problem if nothing has succeeded since. jobs is
  // newest-first, so take the newest job that has actually finished: an old
  // failed stop followed by a clean start is history, not an error. The old
  // `jobs.find(status==='failed')` pinned that banner (and its "try again"
  // button, which then refused with "nothing to retry") to the page forever.
  return {
    ...inst,
    rootPassEnc: undefined,
    vncPass: undefined, // drizzle key is camelCase; the leaked VNC password is NOT a feature
    rootPassword: inst.rootPassEnc ? decrypt(inst.rootPassEnc) : null, // owner/admin session only
    bw: bandState(inst.id, inst.bandwidthGb ?? 0),
    planName: await planInfo(inst.planId),
    step: stepLine(active),
    problem: problemLine(inst.status, lastFailed),
    healCount: inst.healCount ?? 0,
    logLines: logJobLines(logJobId(active, lastFailed, jobs)),
    jobs,
  };
}

/** 'provisioning failed' banner text, or null when there is nothing to show. */
function problemLine(status: string, lastFailed: JobRow | undefined) {
  if (status !== 'error' && !lastFailed) return null;
  return lastFailed?.error || 'provisioning failed';
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, forbidden] = await load(id, user.id, user.role);
  if (forbidden) return forbidden;
  return json(await instancePayload(inst, loadJobs(id)));
}

/** lifecycle actions: start | stop | delete */
export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const { id } = await ctx.params;
  const [inst, forbidden] = await load(id, user.id, user.role);
  if (forbidden) return forbidden;
  const body = (await req.json().catch(() => ({}))) as { action?: string; force?: boolean; name?: string; planId?: string };
  const action = body.action;
  if (action === 'retry') return retryProvisioning(user, inst);
  if (action === 'clone') return cloneInstance(user, inst, body);
  const refused = lifecycleRefusal(action, inst.status);
  if (refused) return refused;
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
