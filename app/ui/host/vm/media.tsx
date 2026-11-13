/** CD-ROM media and the ISO library for one host VM. */

'use client';

import { Ring, Empty } from '@/app/ui/loaders';
import { Field } from '../shared';
import { isosOf } from './actions';
import { fieldValue, pickedFile } from './form';
import type { Detail, IsoList, Op } from './types';

/** Last path segment of the backing file, or a placeholder for an empty drive. */
function mediaName(source: string): string {
  return source ? source.split('/').pop() ?? source : '(empty)';
}

function MediaRow({ d, busy, op }: {
  d: Detail['disks'][number]; busy: string; op: Op;
}) {
  const eject = () => {
    if (confirm(`eject ${d.target}?`)) void op({ op: 'isoDetach', target: d.target }, 'eject media');
  };
  return (
    <tr>
      <td className="mono">{d.target}</td><td>{d.bus}</td>
      <td className="mono muted" style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>{mediaName(d.source)}</td>
      <td style={{ textAlign: 'right' }}>
        <button disabled={!!busy} onClick={eject}>eject</button>
      </td>
    </tr>
  );
}

/** Why the insert button is unavailable, or blank when it is available. */
function insertHint(running: boolean, isos: IsoList['isos']): string {
  if (running) return 'stop the VM to change media';
  return isos.length ? '' : 'no isos uploaded yet';
}

function SpiceRow({ vm, running, busy, op }: { vm: Detail; running: boolean; busy: string; op: Op }) {
  const state = vm.spice ? `enabled on 127.0.0.1:${vm.spice.port}` : 'off';
  const hint = running ? 'stop the VM to change the console' : vm.spice ? `remote-viewer spice://127.0.0.1:${vm.spice.port}` : '';
  return (
    <div className="row" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <Field label="spice console"><span className="muted" style={{ fontSize: 12 }}>{state}</span></Field>
      <button disabled={!!busy || running} onClick={() => void op({ op: 'spice', on: !vm.spice }, vm.spice ? 'disable spice' : 'enable spice')}>
        {vm.spice ? 'disable' : 'enable'}
      </button>
      <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
    </div>
  );
}

export function MediaCard({ vm, running, busy, op, isos, maxGb, uploadBusy, onUpload }: {
  vm: Detail; running: boolean; busy: string; op: Op; isos: IsoList['isos']; maxGb: number;
  uploadBusy: boolean; onUpload: (file: File | null) => void;
}) {
  const drives = vm.disks.filter((d) => d.device === 'cdrom');
  const insert = () => {
    const iso = fieldValue('iso-pick');
    if (iso) void op({ op: 'isoAttach', iso }, 'insert media');
  };
  const upload = () => onUpload(pickedFile('iso-file'));
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>media</h3>
      {drives.length === 0 ? <Empty text="no cdrom attached" /> : (
        <table>
          <thead><tr><th>target</th><th>bus</th><th>media</th><th /></tr></thead>
          <tbody>{drives.map((d) => <MediaRow key={d.target + d.source} d={d} busy={busy} op={op} />)}</tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <Field label="insert iso">
          <select id="iso-pick" defaultValue="" style={{ minWidth: 220 }}>
            <option value="">select…</option>
            {isos.map((i) => <option key={i.name} value={i.name}>{i.name} · {i.sizeMb} MB</option>)}
          </select>
        </Field>
        <button disabled={!!busy || running || !isos.length} onClick={insert}>insert</button>
        <span className="muted" style={{ fontSize: 12 }}>{insertHint(running, isos)}</span>
      </div>

      <div className="row" style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <Field label={`upload iso (max ${maxGb} GB)`}>
          <input id="iso-file" type="file" accept=".iso,application/x-iso9660-image" />
        </Field>
        <button disabled={!!busy || uploadBusy} onClick={upload}>{uploadBusy ? <Ring size={11} /> : 'upload'}</button>
      </div>

      <SpiceRow vm={vm} running={running} busy={busy} op={op} />
    </div>
  );
}
