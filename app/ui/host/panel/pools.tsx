/** Pools tab: libvirt storage pools and their capacity. */

'use client';

import { Ring, Empty } from '@/app/ui/loaders';
import { bytes } from '../shared';
import type { Pool, Post } from './types';

/** "used / capacity", or just used when the pool does not report a capacity. */
function usedCell(pool: Pool): React.ReactNode {
  if (pool.allocationMb == null) return '—';
  return (
    <>
      {bytes(pool.allocationMb * 1048576)}
      {pool.capacityMb != null ? <span className="muted"> / {bytes(pool.capacityMb * 1048576)}</span> : null}
    </>
  );
}

export function Pools({ pools, busy, post }: {
  pools: Pool[]; busy: string; post: Post;
}) {
  if (!pools.length) return <div className="card" style={{ marginTop: 16 }}><Empty icon="database" text="no storage pools defined" /></div>;
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
          {pools.map((pool) => (
            <tr key={pool.name}>
              <td className="mono">{pool.name}</td>
              <td><span className={`badge ${pool.state === 'running' ? 'running' : 'stopped'}`}>{pool.state}</span></td>
              <td>{pool.type || '—'}</td>
              <td className="mono muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pool.path || '—'}</td>
              <td className="mono">{usedCell(pool)}</td>
              <td className="mono">{pool.availableMb != null ? bytes(pool.availableMb * 1048576) : '—'}</td>
              <td>{pool.autostart ? 'yes' : <span className="muted">no</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button disabled={!!busy || pool.state !== 'running'}
                  onClick={() => void post('/api/host', { op: 'poolRefresh', name: pool.name }, `refresh ${pool.name}`)}>
                  {busy === `refresh ${pool.name}` ? <Ring size={10} /> : 'refresh'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
