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
function Badges({ inst }: { inst: Inst }) {
  return (
    <>
      {inst.ip
        ? <span
            data-copy
            title={`${inst.ip} — click to copy`}
            className="mono"
            onClick={() => void copyText(inst.ip, null)}
          >{inst.ip}</span>
        : null}
      <span className="mono" style={{ color: 'var(--accent)' }}>${(inst.rateHourlyCents / 100).toFixed(2)}/h</span>
      {inst.bw && inst.bw.quotaGb > 0
        ? <span className="mono muted">bw {fmtGb(inst.bw.rxBytes + inst.bw.txBytes)}/{inst.bw.quotaGb}GB</span>
        : null}
      {inst.bw?.throttled ? <span className="badge suspended">throttled</span> : null}
      {inst.autoSuspended ? <span className="badge suspended">auto-suspended</span> : null}
    </>
  );
}

/** Lifecycle buttons shown for the current status. */
function Actions({ inst, busy, act, clone, exportDisk }: {
  inst: Inst; busy: boolean;
  act: (a: string) => Promise<void>; clone: () => Promise<void>; exportDisk: () => Promise<void>;
}) {
  const st = inst.status;
  return (
    <>
      {STOPPABLE.includes(st) ? <button disabled={busy} onClick={() => void act('stop')}>stop</button> : null}
      {STARTABLE.includes(st) ? <button disabled={busy} onClick={() => void act('start')}>start</button> : null}
      {CLONABLE.includes(st) ? <button disabled={busy} onClick={() => void clone()}>clone</button> : null}
      {EXPORTABLE.includes(st) ? <button disabled={busy} onClick={() => void exportDisk()}>export</button> : null}
      {DELETABLE.includes(st)
        ? <button className="danger" disabled={busy} onClick={() => void act('delete')}>delete</button>
        : null}
    </>
  );
}

export function StatusCard({ inst, busy, msg, act, clone, exportDisk }: {
  inst: Inst; busy: boolean; msg: string;
  act: (a: string) => Promise<void>; clone: () => Promise<void>; exportDisk: () => Promise<void>;
}) {
  return (
    <div className="card">
      <div className="row" style={{ gap: 14 }}>
        <span className={`badge ${inst.status}`}>
          {['provisioning', 'queued'].includes(inst.status) ? <StatusCue status={inst.status} /> : null}
          {inst.status}
        </span>
        <Badges inst={inst} />
        <div className="spacer" />
        <Actions inst={inst} busy={busy} act={act} clone={clone} exportDisk={exportDisk} />
      </div>
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      {inst.status === 'provisioning' && inst.step && (
        <div className="busybtn" style={{ marginTop: 10, color: 'var(--text-2)', fontSize: 13 }}>
          <Orb state="weaving" size={20} label="provisioning" />
          {inst.step}…
        </div>
      )}
      {inst.status === 'provisioning' && <div style={{ marginTop: 10 }}><BarLoader label="provisioning" /></div>}
      {inst.problem && <ProblemBox inst={inst} busy={busy} act={act} />}
    </div>
  );
}

function ProblemBox({ inst, busy, act }: { inst: Inst; busy: boolean; act: (a: string) => Promise<void> }) {
  return (
    <div className="errbox" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        <Orb state="solving" size={20} label="error" />
        <span>
          {inst.problem}
          {(inst.healCount ?? 0) > 0 && <span className="muted"> · auto-recovery attempt {inst.healCount} of 3</span>}
        </span>
      </span>
      <button onClick={() => void act('retry')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {busy ? <Ring size={11} /> : null} try again
      </button>
    </div>
  );
}
