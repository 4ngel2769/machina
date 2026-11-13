/** Pools tab: libvirt storage pools and their capacity. */

'use client';

import { Ring, Empty } from '@/app/ui/loaders';
import { bytes } from '../shared';
import type { Pool, Post } from './types';

/** "used / capacity", or just used when the pool does not report a capacity. */
function usedCell(p: Pool): React.ReactNode {
  if (p.allocationMb == null) return '—';
  return (
    <>
      {bytes(p.allocationMb * 1048576)}
      {p.capacityMb != null ? <span className="muted"> / {bytes(p.capacityMb * 1048576)}</span> : null}
    </>
  );
}

export function Pools({ pools, busy, post }: {
  pools: Pool[]; busy: string; post: Post;
}) {
  if (!pools.length) return <div className="card" style={{ marginTop: 16 }}><Empty text="no storage pools defined" /></div>;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>storage pools</h3>
      <div className="muted" style={{ marginBottom: 12 }}>
        a dir pool does not notice files placed there by anything but libvirt until it rescans.
        refresh after copying a base image or an ISO into the directory.
      </div>
      <table>
        <thead><tr><th>pool</th><th>state</th><th>type</th><th>path</th><th>used</th><th>free</th><th>autostart</th><th /></tr></thead>
        <tbody>
          {pools.map((p) => (
            <tr key={p.name}>
              <td className="mono">{p.name}</td>
              <td><span className={`badge ${p.state === 'running' ? 'running' : 'stopped'}`}>{p.state}</span></td>
              <td>{p.type || '—'}</td>
              <td className="mono muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.path || '—'}</td>
              <td className="mono">{usedCell(p)}</td>
              <td className="mono">{p.availableMb != null ? bytes(p.availableMb * 1048576) : '—'}</td>
              <td>{p.autostart ? 'yes' : <span className="muted">no</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button disabled={!!busy || p.state !== 'running'}
                  onClick={() => void post('/api/host', { op: 'poolRefresh', name: p.name }, `refresh ${p.name}`)}>
                  {busy === `refresh ${p.name}` ? <Ring size={10} /> : 'refresh'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
