/** Tab strip and the tab bodies for the instance detail page. */

'use client';

import { useState } from 'react';
import { copyText } from '@/app/ui/clipboard';
import { relTime } from '@/app/ui/time';
import { LogStream } from '@/app/ui/logstream';
import { SnapshotsPanel } from '@/app/ui/snapshots';
import { MetricsPanel } from '@/app/ui/metrics';
import { Terminal } from './terminal';
import { Console } from './console';
import { TAB_LABEL, TABS, type Inst, type Job, type Tab } from './types';

export function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <button key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>
          {TAB_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/** Password reveal + recent jobs, the 'info' tab. */
function InfoTab({ inst, jobs }: { inst: Inst; jobs: Job[] }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div>
      <dl className="kv">
        <dt>root password</dt>
        <dd className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showPw ? (
            <>
              <span>{inst.rootPassword ?? '(hidden)'}</span>
              {inst.rootPassword
                ? <button onClick={() => void copyText(inst.rootPassword!, null)} style={{ padding: '2px 8px' }}>copy</button>
                : null}
            </>
          ) : (
            <button onClick={() => setShowPw(true)} style={{ padding: '2px 8px' }}>reveal</button>
          )}
        </dd>
        <dt>mac</dt><dd className="mono">{inst.mac}</dd>
        <dt>created</dt><dd title={new Date(inst.createdAt).toLocaleString()}>{relTime(inst.createdAt)}</dd>
      </dl>
      <h3 style={{ marginTop: 18 }}>recent jobs</h3>
      <table>
        <thead><tr><th>type</th><th>status</th><th>error</th><th>at</th></tr></thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id}>
              <td>{j.type}</td>
              <td><span className={`badge ${j.status}`}>{j.status}</span></td>
              <td className="copy">{j.error || '—'}</td>
              <td title={new Date(j.createdAt).toLocaleString()}>{relTime(j.createdAt)}</td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td colSpan={4} className="empty">no jobs yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** The card body for whichever tab is selected. */
export function TabBody({ tab, inst, jobs }: { tab: Tab; inst: Inst; jobs: Job[] }) {
  const running = inst.status === 'running';
  switch (tab) {
    case 'term':
      return running ? <Terminal instanceId={inst.id} /> : <div className="muted">terminal available when running</div>;
    case 'vnc':
      return running ? <Console instanceId={inst.id} /> : <div className="muted">console available when running</div>;
    case 'snapshots':
      return <SnapshotsPanel instanceId={inst.id} instanceStatus={inst.status} />;
    case 'metrics':
      return <MetricsPanel instanceId={inst.id} instanceStatus={inst.status} />;
    case 'logs':
      return <LogStream lines={inst.logLines ?? []} live={inst.status === 'provisioning'} height={340} />;
    case 'info':
      return <InfoTab inst={inst} jobs={jobs} />;
  }
}
