'use client';

import { Orb } from './loaders';

/** Status cue for a VM or job: a live orb while work is in flight (the orb
 *  state varies by what's happening), a quiet dot once it has settled. */
export function StatusCue({ status, jobType, size = 8 }: { status: string; jobType?: string; size?: number }) {
  const live = status === 'provisioning' || status === 'queued' || status === 'downloading'
    || status === 'starting' || status === 'stopping' || status === 'deleting';
  if (live) return <span className="status-orb" title={status}><Orb state={jobType ?? status} size={20} label={status} /></span>;
  return <span className={`status-dot ${status}`} style={{ width: size, height: size }} title={status} />;
}
