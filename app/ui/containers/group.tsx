/** One compose project's worth of containers, as a table. */

'use client';

import { Fragment } from 'react';
import { bytes } from '@/app/ui/host/shared';
import type { useContainerActions } from './actions';
import { badge, type Container } from './types';

type Actions = ReturnType<typeof useContainerActions>;

function cpuCell(c: Container): string {
  return c.cpuPct == null ? '—' : `${c.cpuPct.toFixed(1)}%`;
}

function memCell(c: Container): React.ReactNode {
  if (c.memMb == null) return '—';
  const pct = c.memPct == null ? '' : ` · ${c.memPct.toFixed(0)}%`;
  return `${bytes(c.memMb * 1048576)}${pct}`;
}

function portsCell(c: Container): React.ReactNode {
  return c.ports || '—';
}

/** The badge plus a second "starting" chip while docker reports a healthcheck warmup. */
function StateCell({ c }: { c: Container }) {
  return (
    <>
      <span className={`badge ${badge(c)}`}>{c.health === 'unhealthy' ? 'unhealthy' : c.state}</span>
      {c.health === 'starting' && <span className="badge queued" style={{ marginLeft: 6 }}>starting</span>}
    </>
  );
}

/** Stop/start/restart/remove for the row; restart only while running. */
function RowActions({ c, actions }: { c: Container; actions: Actions }) {
  const { busy, act, showLogs, remove, openId, logs } = actions;
  const running = c.state === 'running';
  return (
    <>
      <button disabled={!!busy} onClick={() => void showLogs(c)}>{openId === c.id ? 'hide' : 'logs'}</button>{' '}
      {running && <button disabled={!!busy} onClick={() => void act(c, 'restart')}>restart</button>}{' '}
      {running
        ? <button className="danger" disabled={!!busy} onClick={() => void act(c, 'stop')}>stop</button>
        : <button disabled={!!busy} onClick={() => void act(c, 'start')}>start</button>}{' '}
      {c.managed && <button className="danger" disabled={!!busy} onClick={() => void remove(c)}>remove</button>}
    </>
  );
}

function LogsRow({ c, actions }: { c: Container; actions: Actions }) {
  const { openId, logs } = actions;
  if (openId !== c.id) return null;
  return (
    <tr>
      <td colSpan={7}>
        <pre
          className="mono"
          style={{ maxHeight: 280, overflow: 'auto', margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        >{logs[c.id] ?? 'reading logs…'}</pre>
      </td>
    </tr>
  );
}

export function ContainerGroup({ project, cs, actions }: {
  project: string; cs: Container[]; actions: Actions;
}) {
  const running = cs.filter((c) => c.state === 'running').length;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{project}</h3>
        <span className="muted mono" style={{ fontSize: 11 }}>{running}/{cs.length} up</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>name</th><th>state</th><th>image</th><th>cpu</th><th>ram</th><th>ports</th><th />
          </tr>
        </thead>
        <tbody>
          {cs.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td className="mono">{c.service ?? c.name}</td>
                <td><StateCell c={c} /></td>
                <td className="mono muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.image}>
                  {c.image}
                </td>
                <td className="mono">{cpuCell(c)}</td>
                <td className="mono" title={c.memLimitMb ? `of ${bytes(c.memLimitMb * 1048576)}` : undefined}>{memCell(c)}</td>
                <td className="mono muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ports}>
                  {portsCell(c)}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <RowActions c={c} actions={actions} />
                </td>
              </tr>
              <LogsRow c={c} actions={actions} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
