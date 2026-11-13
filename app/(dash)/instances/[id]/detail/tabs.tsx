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
      {TABS.map((tabKey) => (
        <button key={tabKey} onClick={() => setTab(tabKey)} className={tab === tabKey ? 'active' : ''}>
          {TAB_LABEL[tabKey]}
        </button>
      ))}
    </div>
  );
}

/** Password reveal + recent jobs, the 'info' tab. */
function InfoTab({ instance, jobs }: { instance: Inst; jobs: Job[] }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div>
      <dl className="kv">
        <dt>root password</dt>
        <dd className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showPw ? (
            <>
              <span>{instance.rootPassword ?? '(hidden)'}</span>
              {instance.rootPassword
                ? <button onClick={() => void copyText(instance.rootPassword!, null)} style={{ padding: '2px 8px' }}>copy</button>
                : null}
            </>
          ) : (
            <button onClick={() => setShowPw(true)} style={{ padding: '2px 8px' }}>reveal</button>
          )}
        </dd>
        <dt>mac</dt><dd className="mono">{instance.mac}</dd>
        <dt>created</dt><dd title={new Date(instance.createdAt).toLocaleString()}>{relTime(instance.createdAt)}</dd>
      </dl>
      <h3 style={{ marginTop: 18 }}>recent jobs</h3>
      <table>
        <thead><tr><th>type</th><th>status</th><th>error</th><th>at</th></tr></thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>{job.type}</td>
              <td><span className={`badge ${job.status}`}>{job.status}</span></td>
              <td className="copy">{job.error || '—'}</td>
              <td title={new Date(job.createdAt).toLocaleString()}>{relTime(job.createdAt)}</td>
            </tr>
          ))}
          {jobs.length === 0 && <tr><td colSpan={4} className="empty">no jobs yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** The card body for whichever tab is selected. */
export function TabBody({ tab, instance, jobs }: { tab: Tab; instance: Inst; jobs: Job[] }) {
  const isRunning = instance.status === 'running';
  switch (tab) {
    case 'term':
      return isRunning ? <Terminal instanceId={instance.id} /> : <div className="muted">terminal available when running</div>;
    case 'vnc':
      return isRunning ? <Console instanceId={instance.id} /> : <div className="muted">console available when running</div>;
    case 'snapshots':
      return <SnapshotsPanel instanceId={instance.id} instanceStatus={instance.status} />;
    case 'metrics':
      return <MetricsPanel instanceId={instance.id} instanceStatus={instance.status} />;
    case 'logs':
      return <LogStream lines={instance.logLines ?? []} live={instance.status === 'provisioning'} height={340} />;
    case 'info':
      return <InfoTab instance={instance} jobs={jobs} />;
  }
}
