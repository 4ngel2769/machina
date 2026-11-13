/** Snapshot list, take/revert/delete for one host VM. */

'use client';

import { Empty } from '@/app/ui/loaders';
import { bytes, Field } from '../shared';
import { fieldValue } from './form';
import type { Op, Snap } from './types';

function SnapRow({ snap, busy, op }: { snap: Snap; busy: string; op: Op }) {
  const revert = () => {
    if (confirm(`revert to ${snap.name}? the current disk state is lost.`)) {
      void op({ op: 'snapshotRevert', snapName: snap.name }, 'revert');
    }
  };
  const del = () => {
    if (confirm(`delete ${snap.name}?`)) void op({ op: 'snapshotDelete', snapName: snap.name }, 'delete snapshot');
  };
  return (
    <tr>
      <td className="mono">{snap.name}{snap.isCurrent ? <span className="muted"> · current</span> : null}</td>
      <td>{snap.state}</td>
      <td className="mono">{bytes(snap.sizeBytes)}</td>
      <td className="muted">{new Date(snap.createdAt).toLocaleString()}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button disabled={!!busy} onClick={revert}>revert</button>
        <button style={{ marginLeft: 6, color: 'var(--danger, #f87171)' }} disabled={!!busy} onClick={del}>delete</button>
      </td>
    </tr>
  );
}

export function SnapshotsCard({ snaps, busy, op }: {
  snaps: Snap[]; busy: string; op: Op;
}) {
  const take = () => {
    void op({ op: 'snapshotCreate', snapName: fieldValue('sn') }, 'snapshot');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>snapshots</h3>
      {snaps.length === 0 ? <Empty icon="layers" text="no snapshots" /> : (
        <table>
          <thead><tr><th>name</th><th>state</th><th>added</th><th>taken</th><th /></tr></thead>
          <tbody>{snaps.map((snap) => <SnapRow key={snap.name} snap={snap} busy={busy} op={op} />)}</tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="new snapshot"><input id="sn" style={{ width: 160 }} placeholder="auto name" className="mono" /></Field>
        <button className="primary" disabled={!!busy} onClick={take}>take snapshot</button>
      </div>
    </div>
  );
}
