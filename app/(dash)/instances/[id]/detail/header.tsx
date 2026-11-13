/** Status badges and lifecycle buttons for the instance detail header. */

'use client';

import { copyText } from '@/app/ui/clipboard';
import { StatusCue } from '@/app/ui/status';
import { Orb, Ring, BarLoader } from '@/app/ui/loaders';
import { fmtGb, type Inst } from './types';

const STOPPABLE = ['running', 'suspended'];
const STARTABLE = ['stopped', 'suspended', 'error'];
const CLONABLE = ['stopped', 'suspended', 'error'];
const EXPORTABLE = ['stopped', 'suspended', 'error'];
const DELETABLE = ['stopped', 'suspended', 'running', 'error'];

/** Badges: ip (click to copy), rate, bandwidth, suspension flags. */
function Badges({ instance }: { instance: Inst }) {
  return (
    <>
      {instance.ip
        ? <span
            data-copy
            title={`${instance.ip} — click to copy`}
            className="mono"
            onClick={() => void copyText(instance.ip, null)}
          >{instance.ip}</span>
        : null}
      <span className="mono" style={{ color: 'var(--accent)' }}>${(instance.rateHourlyCents / 100).toFixed(2)}/h</span>
      {instance.bw && instance.bw.quotaGb > 0
        ? <span className="mono muted">bw {fmtGb(instance.bw.rxBytes + instance.bw.txBytes)}/{instance.bw.quotaGb}GB</span>
        : null}
      {instance.bw?.throttled ? <span className="badge suspended">throttled</span> : null}
      {instance.autoSuspended ? <span className="badge suspended">auto-suspended</span> : null}
    </>
  );
}

/** Lifecycle buttons shown for the current status. */
function Actions({ instance, busy, act, clone, exportDisk }: {
  instance: Inst; busy: boolean;
  act: (action: string) => Promise<void>; clone: () => Promise<void>; exportDisk: () => Promise<void>;
}) {
  const status = instance.status;
  return (
    <>
      {STOPPABLE.includes(status) ? <button disabled={busy} onClick={() => void act('stop')}>stop</button> : null}
      {STARTABLE.includes(status) ? <button disabled={busy} onClick={() => void act('start')}>start</button> : null}
      {CLONABLE.includes(status) ? <button disabled={busy} onClick={() => void clone()}>clone</button> : null}
      {EXPORTABLE.includes(status) ? <button disabled={busy} onClick={() => void exportDisk()}>export</button> : null}
      {DELETABLE.includes(status)
        ? <button className="danger" disabled={busy} onClick={() => void act('delete')}>delete</button>
        : null}
    </>
  );
}

export function StatusCard({ instance, busy, msg, act, clone, exportDisk }: {
  instance: Inst; busy: boolean; msg: string;
  act: (action: string) => Promise<void>; clone: () => Promise<void>; exportDisk: () => Promise<void>;
}) {
  return (
    <div className="card">
      <div className="row" style={{ gap: 14 }}>
        <span className={`badge ${instance.status}`}>
          {['provisioning', 'queued'].includes(instance.status) ? <StatusCue status={instance.status} /> : null}
          {instance.status}
        </span>
        <Badges instance={instance} />
        <div className="spacer" />
        <Actions instance={instance} busy={busy} act={act} clone={clone} exportDisk={exportDisk} />
      </div>
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      {instance.status === 'provisioning' && instance.step && (
        <div className="busybtn" style={{ marginTop: 10, color: 'var(--text-2)', fontSize: 13 }}>
          <Orb state="weaving" size={20} label="provisioning" />
          {instance.step}…
        </div>
      )}
      {instance.status === 'provisioning' && <div style={{ marginTop: 10 }}><BarLoader label="provisioning" /></div>}
      {instance.problem && <ProblemBox instance={instance} busy={busy} act={act} />}
    </div>
  );
}

function ProblemBox({ instance, busy, act }: { instance: Inst; busy: boolean; act: (action: string) => Promise<void> }) {
  return (
    <div className="errbox" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Orb state="solving" size={20} label="error" />
        <span>
          {instance.problem}
          {(instance.healCount ?? 0) > 0 && <span className="muted"> · auto-recovery attempt {instance.healCount} of 3</span>}
        </span>
      </span>
      <button onClick={() => void act('retry')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {busy ? <Ring size={11} /> : null} try again
      </button>
    </div>
  );
}
