/**
 * The caller's live jobs for the global progress toasts: queued/running rows
 * plus anything finished in the last few minutes so a toast can announce the
 * outcome after the poll first saw it.
 */
import { requireUser } from '@/lib/auth';
import { json, err, requireScope } from '@/lib/api';
import { rawDb } from '@/lib/db';
import { friendlyStep } from '@/lib/core/errors';
import { now } from '@/lib/core/util';

export const dynamic = 'force-dynamic';

type JobRow = {
  id: string; type: string; status: string; log: string; error: string;
  instance_id: string | null; created_at: number; finished_at: number | null;
};

/** Last meaningful log line, made readable for a one-line toast. */
function lastStep(log: string): string {
  const step = friendlyStep(log);
  if (step !== 'working') return step;
  const lines = String(log ?? '').split('\n').filter(Boolean);
  const last = lines[lines.length - 1]?.replace(/^\[[^\]]+\]\s*/, '').trim();
  return last ? last.slice(0, 80) : 'working';
}

export async function GET() {
  const denied = await requireScope('instances:read');
  if (denied) return denied;
  const user = await requireUser();
  if (!user) return err('unauthorized', 401);

  const scope = user.role === 'admin' ? '' : 'and user_id = ?';
  const params = user.role === 'admin' ? [] : [user.id];
  const active = rawDb().prepare(
    `select id, type, status, log, error, instance_id, created_at, finished_at from jobs
     where status in ('queued','running') ${scope} order by created_at desc limit 10`,
  ).all(...params) as JobRow[];

  const recent = rawDb().prepare(
    `select id, type, status, log, error, instance_id, created_at, finished_at from jobs
     where status in ('done','failed') and finished_at > ? ${scope} order by finished_at desc limit 10`,
  ).all(now() - 10 * 60_000, ...params) as JobRow[];

  const nameOf = (instanceId: string | null): string => {
    if (!instanceId) return '';
    const row = rawDb().prepare(`select name from instances where id=?`).get(instanceId) as { name: string } | undefined;
    return row?.name ?? '';
  };

  const shape = (job: JobRow) => ({
    id: job.id, type: job.type, status: job.status,
    step: lastStep(job.log), error: job.error || null,
    instanceId: job.instance_id, instanceName: nameOf(job.instance_id),
    link: job.instance_id ? `/instances/${job.instance_id}` : null,
  });

  return json({ ok: true, active: active.map(shape), recent: recent.map(shape) });
}
