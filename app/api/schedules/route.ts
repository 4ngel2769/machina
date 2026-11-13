/**
 * Scheduled operations: list, create and cancel start/stop schedules for one
 * instance. The server computes next_run; the panel only renders it.
 */
import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { json, err, guardMutation, jsonBody, requireScope } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { z } from 'zod';
import { scheduleSpec, insertSchedule, listSchedules, cancelSchedule, type ScheduledOp } from '@/lib/services/schedule';

const bodySchema = z.object({
  op: z.string().optional(),
  id: z.string().optional(),
  instanceId: z.string().optional(),
  action: z.string().optional(),
  freq: z.string().optional(),
  runAt: z.number().optional(),
  time: z.string().optional(),
  dow: z.number().optional(),
}).passthrough();

type User = { id: string; name: string; role: string };

/** Resolve an instance the caller may schedule against, or the refusal. */
function instanceFor(user: User, instanceId: string | undefined) {
  if (!instanceId) return { error: err('instanceId required') } as const;
  const inst = rawDb().prepare(
    `select id, user_id, status from instances where id=?`,
  ).get(instanceId) as { id: string; user_id: string; status: string } | undefined;
  if (!inst) return { error: err('instance not found', 404) } as const;
  if (user.role !== 'admin' && inst.user_id !== user.id) return { error: err('forbidden', 403) } as const;
  return { inst } as const;
}

/** Only a settled VM can be scheduled — a provisioning or mid-job instance
 *  would fire into a race the job queue cannot order. */
function scheduleable(status: string): string | null {
  if (status === 'running' || status === 'stopped') return null;
  return 'instance must be running or stopped to schedule an action';
}

async function create(user: User, body: z.infer<typeof bodySchema>) {
  const found = instanceFor(user, body.instanceId);
  if ('error' in found) return found.error;
  const blocked = scheduleable(found.inst.status);
  if (blocked) return err(blocked, 409);
  const active = rawDb().prepare(
    `select 1 from jobs where instance_id=? and status in ('queued','running') limit 1`,
  ).get(found.inst.id);
  if (active) return err('a job is already in flight for this instance', 409);

  const spec = scheduleSpec(body);
  if (!spec.ok) return err(spec.error);
  const id = insertSchedule(user.id, found.inst.id, spec.spec);
  return json({ ok: true, id, nextRun: spec.spec.nextRun }, 201);
}

async function list(user: User, instanceId: string | undefined) {
  if (!instanceId) {
    const ops = listSchedules(user.id, user.role === 'admin');
    return json({ ok: true, schedules: ops });
  }
  const found = instanceFor(user, instanceId);
  if ('error' in found) return found.error;
  const ops = rawDb().prepare(
    `select * from scheduled_ops where instance_id=? and status != 'cancelled'
     order by case when status='active' then 0 else 1 end, next_run asc limit 50`,
  ).all(found.inst.id) as ScheduledOp[];
  return json({ ok: true, schedules: ops });
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const scopeDenied = await requireScope('instances:read');
  if (scopeDenied) return scopeDenied;
  return list(user, req.nextUrl.searchParams.get('instanceId') ?? undefined);
}

export async function POST(req: NextRequest) {
  const denied = guardMutation(req);
  if (denied) return denied;
  const scopeDenied = await requireScope('instances:write');
  if (scopeDenied) return scopeDenied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);
  const body = await jsonBody(req, bodySchema);
  if (body.op === 'cancel') {
    if (!body.id) return err('id required');
    return cancelSchedule(user.id, body.id, user.role === 'admin')
      ? json({ ok: true, status: 'cancelled' })
      : err('schedule not found or already settled', 404);
  }
  return create(user, body);
}

export const dynamic = 'force-dynamic';
