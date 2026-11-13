/** Disk list and attach for one host VM. */

'use client';

import { Field } from '../shared';
import { fieldValue } from './form';
import type { Detail, Op } from './types';

function sizeCell(sizeGb: number | null): React.ReactNode {
  if (!sizeGb) return '—';
  return `${sizeGb} GB`;
}

function DiskRow({ d, busy, op }: {
  d: Detail['disks'][number]; busy: string; op: Op;
}) {
  const detach = () => {
    if (confirm(`detach ${d.target}? the file stays on the host.`)) {
      void op({ op: 'diskDetach', target: d.target }, 'detach disk');
    }
  };
  return (
    <tr>
      <td className="mono">{d.target}</td><td>{d.bus}</td><td>{d.device}</td><td>{d.format}</td>
      <td className="mono">{sizeCell(d.sizeGb)}</td>
      <td className="mono muted" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.source || '—'}</td>
      <td style={{ textAlign: 'right' }}>
        {d.device === 'disk' && (
          <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy} onClick={detach}>detach</button>
        )}
      </td>
    </tr>
  );
}

export function DisksCard({ vm, busy, op }: { vm: Detail; busy: string; op: Op }) {
  const attach = () => {
    void op({ op: 'diskAttach', sizeGb: Number(fieldValue('disk-gb')) }, 'attach disk');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>disks</h3>
      <table>
        <thead><tr><th>target</th><th>bus</th><th>device</th><th>format</th><th>size</th><th>source</th><th /></tr></thead>
        <tbody>
          {vm.disks.map((d) => <DiskRow key={d.target + d.source} d={d} busy={busy} op={op} />)}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="new disk (GB)"><input id="disk-gb" style={{ width: 90 }} defaultValue="20" className="mono" /></Field>
        <button disabled={!!busy} onClick={attach}>attach a new disk</button>
      </div>
    </div>
  );
}
