/**
 * Global job progress toasts. Polls /api/jobs/active and keeps one persistent
 * sonner toast per running job — streaming the latest step, compactable to a
 * single line, and linking to the instance. Finished jobs get a normal toast.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast as sonner } from 'sonner';

type Job = {
  id: string; type: string; status: string; step: string; error: string | null;
  instanceId: string | null; instanceName: string; link: string | null;
};
type ActiveBody = { active: Job[]; recent: Job[] };

const JOB_LABEL: Record<string, string> = {
  'instance.create': 'provisioning',
  'instance.start': 'starting',
  'instance.stop': 'stopping',
  'instance.delete': 'deleting',
  'instance.snapshot.create': 'snapshotting',
  'instance.snapshot.revert': 'reverting',
  'instance.snapshot.delete': 'deleting snapshot',
};

function label(job: Job): string {
  return job.instanceName ? `${job.instanceName} — ${JOB_LABEL[job.type] ?? job.type}` : (JOB_LABEL[job.type] ?? job.type);
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, padding: '0 4px', opacity: 0.7 };
const cardStyle: React.CSSProperties = {
  minWidth: 280, maxWidth: 380,
  background: 'var(--surface-2)', border: '1px solid var(--line)',
  borderRadius: 12, padding: '12px 14px', color: 'inherit',
};

function JobToast({ job, onDismiss }: { job: Job; onDismiss: () => void }) {
  const [compact, setCompact] = useState(false);
  const failed = job.status === 'failed';

  if (compact) {
    return (
      <button
        onClick={() => setCompact(false)}
        title="expand"
        aria-label="expand job progress"
        style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer' }}
      >
        <span className={`jobdot ${failed ? 'err' : 'run'}`} aria-hidden />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{label(job)}</span>
        <span className="muted" style={{ fontSize: 11 }}>{job.step}</span>
      </button>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className={`jobdot ${failed ? 'err' : 'run'}`} aria-hidden />
        <strong style={{ flex: 1, fontSize: 13 }}>{label(job)}</strong>
        <button onClick={() => setCompact(true)} title="compact" aria-label="compact" style={iconBtn}>–</button>
        <button onClick={onDismiss} aria-label="dismiss" style={iconBtn}>×</button>
      </div>
      {/* aria-live so screen readers announce progress without stealing focus */}
      <div className="muted" aria-live="polite" style={{ fontSize: 12, lineHeight: 1.5, minHeight: 18 }}>
        {job.step}
        {failed && job.error ? <div style={{ color: 'var(--danger)', marginTop: 4 }}>{job.error}</div> : null}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12 }}>
        {job.link ? <Link href={job.link} style={{ color: 'var(--accent)' }} onClick={onDismiss}>open instance</Link> : null}
      </div>
    </div>
  );
}

/** Keep one persistent toast per live job; update in place via stable id. */
function syncActiveJobs(body: ActiveBody, toastIds: Map<string, string | number>, dismissJob: (id: string) => void) {
  const live = new Set(body.active.map((job) => job.id));
  for (const jobId of [...toastIds.keys()]) {
    if (!live.has(jobId)) dismissJob(jobId);
  }
  for (const job of body.active) {
    const existing = toastIds.get(job.id);
    const render = () => <JobToast job={job} onDismiss={() => dismissJob(job.id)} />;
    if (existing !== undefined) {
      sonner.custom(render, { id: existing, duration: Infinity });
    } else {
      const id = sonner.custom(render, { duration: Infinity });
      toastIds.set(job.id, id);
    }
  }
}

/** Announce each finished job exactly once. */
function announceFinished(body: ActiveBody, announced: Set<string>, dismissJob: (id: string) => void) {
  for (const job of body.recent) {
    if (announced.has(job.id)) continue;
    announced.add(job.id);
    dismissJob(job.id);
    if (job.status === 'done') sonner.success(`${label(job)} finished`);
    else sonner.error(`${label(job)} failed${job.error ? ` — ${job.error}` : ''}`, { duration: 10000 });
  }
}

export function JobToasts() {
  const toastIds = useRef(new Map<string, string | number>());
  const announced = useRef(new Set<string>());

  const dismissJob = useCallback((jobId: string) => {
    const id = toastIds.current.get(jobId);
    if (id !== undefined) sonner.dismiss(id);
    toastIds.current.delete(jobId);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs/active', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as ActiveBody;
      syncActiveJobs(body, toastIds.current, dismissJob);
      announceFinished(body, announced.current, dismissJob);
    } catch {
      /* polling must never throw into render */
    }
  }, [dismissJob]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return null;
}
