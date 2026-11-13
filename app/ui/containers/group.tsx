/** One compose project's worth of containers, as a table. */

'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { bytes } from '@/app/ui/host/shared';
import type { useContainerActions } from './actions';
import { badge, type Container } from './types';

type Actions = ReturnType<typeof useContainerActions>;

function cpuCell(container: Container): string {
  return container.cpuPct == null ? '—' : `${container.cpuPct.toFixed(1)}%`;
}

function memCell(container: Container): React.ReactNode {
  if (container.memMb == null) return '—';
  const pct = container.memPct == null ? '' : ` · ${container.memPct.toFixed(0)}%`;
  return `${bytes(container.memMb * 1048576)}${pct}`;
}

function portsCell(container: Container): React.ReactNode {
  return container.ports || '—';
}

/** The badge plus a second "starting" chip while docker reports a healthcheck warmup. */
function StateCell({ container }: { container: Container }) {
  return (
    <>
      <span className={`badge ${badge(container)}`}>{container.health === 'unhealthy' ? 'unhealthy' : container.state}</span>
      {container.health === 'starting' && <span className="badge queued" style={{ marginLeft: 6 }}>starting</span>}
    </>
  );
}

/** Stop/start/restart/pause/kill/remove for the row; restart only while running. */
function RowActions({ container, actions }: { container: Container; actions: Actions }) {
  const { busy, act, showLogs, remove, openId, logs } = actions;
  const running = container.state === 'running';
  const paused = container.state === 'paused';
  return (
    <>
      <Link href={`/containers/${encodeURIComponent(container.id)}`} style={{ marginRight: 8 }}>open</Link>
      <button disabled={!!busy} onClick={() => void showLogs(container)}>{openId === container.id ? 'hide' : 'logs'}</button>{' '}
      {running && <button disabled={!!busy} onClick={() => void act(container, 'restart')}>restart</button>}{' '}
      {paused
        ? <button disabled={!!busy} onClick={() => void act(container, 'unpause')}>unpause</button>
        : running && <button disabled={!!busy} onClick={() => void act(container, 'pause')}>pause</button>}{' '}
      {running
        ? <button className="danger" disabled={!!busy} onClick={() => void act(container, 'stop')}>stop</button>
        : <button disabled={!!busy} onClick={() => void act(container, 'start')}>start</button>}{' '}
      {running && (
        <button className="danger" disabled={!!busy} onClick={() => {
          if (confirm(`Kill ${container.name}? SIGKILL — no shutdown hook runs.`)) void act(container, 'kill');
        }}>kill</button>
      )}{' '}
      {container.managed && <button className="danger" disabled={!!busy} onClick={() => void remove(container)}>remove</button>}
    </>
  );
}

function LogsRow({ container, actions }: { container: Container; actions: Actions }) {
  const { openId, logs } = actions;
  if (openId !== container.id) return null;
  return (
    <tr>
      <td colSpan={7}>
        <pre
          className="mono"
          style={{ maxHeight: 280, overflow: 'auto', margin: 0, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        >{logs[container.id] ?? 'reading logs…'}</pre>
      </td>
    </tr>
  );
}

export function ContainerGroup({ project, containers, actions }: {
  project: string; containers: Container[]; actions: Actions;
}) {
  const running = containers.filter((container) => container.state === 'running').length;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{project}</h3>
        <span className="muted mono" style={{ fontSize: 11 }}>{running}/{containers.length} up</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>name</th><th>state</th><th>image</th><th>cpu</th><th>ram</th><th>ports</th><th />
          </tr>
        </thead>
        <tbody>
          {containers.map((container) => (
            <Fragment key={container.id}>
              <tr>
                <td className="mono"><Link href={`/containers/${encodeURIComponent(container.id)}`}>{container.service ?? container.name}</Link></td>
                <td><StateCell container={container} /></td>
                <td className="mono muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={container.image}>
                  {container.image}
                </td>
                <td className="mono">{cpuCell(container)}</td>
                <td className="mono" title={container.memLimitMb ? `of ${bytes(container.memLimitMb * 1048576)}` : undefined}>{memCell(container)}</td>
                <td className="mono muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={container.ports}>
                  {portsCell(container)}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <RowActions container={container} actions={actions} />
                </td>
              </tr>
              <LogsRow container={container} actions={actions} />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
