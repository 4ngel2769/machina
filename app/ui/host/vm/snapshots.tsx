/** Snapshot list, take/revert/delete for one host VM. */

'use client';

import { Empty } from '@/app/ui/loaders';
import { bytes, Field } from '../shared';
import { fieldValue } from './form';
import type { Op, Snap } from './types';

function SnapRow({ s, busy, op }: { s: Snap; busy: string; op: Op }) {
  const revert = () => {
    if (confirm(`revert to ${s.name}? the current disk state is lost.`)) {
      void op({ op: 'snapshotRevert', snapName: s.name }, 'revert');
    }
  };
  const del = () => {
    if (confirm(`delete ${s.name}?`)) void op({ op: 'snapshotDelete', snapName: s.name }, 'delete snapshot');
  };
  return (
    <tr>
      <td className="mono">{s.name}{s.isCurrent ? <span className="muted"> · current</span> : null}</td>
      <td>{s.state}</td>
      <td className="mono">{bytes(s.sizeBytes)}</td>
      <td className="muted">{new Date(s.createdAt).toLocaleString()}</td>
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
      {snaps.length === 0 ? <Empty text="no snapshots" /> : (
        <table>
          <thead><tr><th>name</th><th>state</th><th>added</th><th>taken</th><th /></tr></thead>
          <tbody>{snaps.map((s) => <SnapRow key={s.name} s={s} busy={busy} op={op} />)}</tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="new snapshot"><input id="sn" style={{ width: 160 }} placeholder="auto name" className="mono" /></Field>
        <button className="primary" disabled={!!busy} onClick={take}>take snapshot</button>
      </div>
    </div>
  );
}
