/** Header, create form, revert confirm and the snapshot table. */

'use client';

import { Orb, Ring, Empty } from '../loaders';
import { relTime } from '../time';
import type { SnapshotsState } from './use';
import { fmtBytes, NAME_RE, PRESETS, type ConfirmState, type Snap } from './types';

export function SnapHead({ snaps, disk, planDiskGb, busy, confirm }: {
  snaps: Snap[]; disk: SnapshotsState['disk']; planDiskGb: number; busy: string; confirm: ConfirmState | null;
}) {
  return (
    <div className="snaphead">
      <div>
        <div className="snapcount">
          {snaps.length} snapshot{snaps.length === 1 ? '' : 's'}
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          A snapshot saves this instance&rsquo;s disk only. Memory, processes and
          open files are not captured.
        </div>
        {disk && (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            disk in use <span className="mono">{fmtBytes(disk.actualBytes)}</span>
            {planDiskGb > 0 && <> of {planDiskGb} GB plan</>}
            {disk.freeMb > 0 && <> · {Math.round(disk.freeMb / 1024)} GB free on the host</>}
          </div>
        )}
      </div>
      {busy && (
        <span className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Orb state={confirm ? 'solving' : 'shaping'} size={20} /> working
        </span>
      )}
    </div>
  );
}

export function SnapNew({ s, live, canAct }: {
  s: SnapshotsState; live: boolean; canAct: boolean;
}) {
  const nameErr = s.name && !NAME_RE.test(s.name)
    ? 'lowercase letters, digits and dashes only'
    : '';
  return (
    <div className="snapnew">
      <div className="snappresets">
        {PRESETS.map((p) => (
          <button key={p} className="chip" onClick={() => s.setName(p)} disabled={Boolean(s.busy)}>
            {p}
          </button>
        ))}
      </div>
      <div className="snaprow">
        <input
          value={s.name}
          placeholder="snapshot name"
          onChange={(e) => s.setName(e.target.value.toLowerCase())}
          className={nameErr ? 'bad' : ''}
          disabled={Boolean(s.busy)}
        />
        <input
          value={s.desc}
          placeholder="note (optional)"
          onChange={(e) => s.setDesc(e.target.value)}
          disabled={Boolean(s.busy)}
        />
        <button
          className="primary"
          disabled={Boolean(s.busy) || !s.name || Boolean(nameErr)}
          onClick={() => void s.post({ action: 'create', name: s.name, description: s.desc })}
        >
          {s.busy && s.busy === s.name ? <Ring size={12} /> : null} take snapshot
        </button>
      </div>
      {nameErr && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{nameErr}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {live
          ? 'The instance is live, so the snapshot is taken while it keeps running.'
          : 'The instance is off, so the snapshot is taken cleanly.'}
      </div>
    </div>
  );
}

export function SnapConfirm({ s, mode }: { s: SnapshotsState; mode: ConfirmState }) {
  return (
    <div className="notice warn" style={{ marginBottom: 12 }}>
      <div>
        <strong>Roll back to &ldquo;{mode.snap.name}&rdquo;?</strong>{' '}
        {mode.mode === 'clean'
          ? 'The instance will be shut down first, its disk rolled back, then started again. Anything written since the snapshot is lost.'
          : 'The disk rolls back under the running guest, like pulling the power. Its filesystem may be left needing a repair on next boot.'}
        {' '}The snapshot captured the disk only, so the rolled-back filesystem is
        exactly as consistent as it was at the moment the snapshot was taken{' '}
        {mode.mode === 'clean' && '(this snapshot was taken while the instance was running)'}.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="primary"
          onClick={() => void s.post({ action: 'revert', name: mode.snap.name, mode: mode.mode })}
          disabled={Boolean(s.busy)}
        >
          {s.busy ? <Ring size={12} /> : null} yes, roll back
        </button>
        <button onClick={() => s.setConfirm(null)} disabled={Boolean(s.busy)}>cancel</button>
      </div>
    </div>
  );
}

function StateBadge({ s }: { s: Snap }) {
  if (s.state === 'missing') return <span className="badge err">gone</span>;
  if (s.current) return <span className="badge running">current</span>;
  return <span className="badge">disk</span>;
}

function SnapRow({ s, s2, canAct, setConfirm }: {
  s: Snap; s2: SnapshotsState; canAct: boolean; setConfirm: (v: ConfirmState) => void;
}) {
  const dead = s.state === 'missing';
  const dis = Boolean(s2.busy) || !canAct || dead;
  return (
    <tr>
      <td>
        <div className="mono">{s.name}</div>
        {s.description && <div className="muted" style={{ fontSize: 12 }}>{s.description}</div>}
      </td>
      <td title={new Date(s.createdAt).toLocaleString()}>
        {s.createdAt ? relTime(s.createdAt) : '—'}
      </td>
      <td><StateBadge s={s} /></td>
      <td className="snapacts">
        <button
          disabled={dis}
          onClick={() => setConfirm({ snap: s, mode: 'clean' })}
          title="Shut the instance down, roll back, start it again"
        >
          roll back
        </button>
        <button
          disabled={dis}
          onClick={() => setConfirm({ snap: s, mode: 'live' })}
          title="Roll back without shutting down first"
        >
          roll back live
        </button>
        <button
          className="danger"
          disabled={dis}
          onClick={() => void s2.post({ action: 'delete', name: s.name })}
        >
          delete
        </button>
      </td>
    </tr>
  );
}

export function SnapTable({ s, canAct }: { s: SnapshotsState; canAct: boolean }) {
  if (!s.loaded) return <div className="muted" style={{ padding: '18px 0' }}>loading snapshots…</div>;
  if (s.snaps.length === 0) {
    return <Empty text="No snapshots yet. Take one before a risky upgrade so you can come back to it." />;
  }
  return (
    <table className="snaptable">
      <thead>
        <tr>
          <th>name</th><th>taken</th><th>state</th><th />
        </tr>
      </thead>
      <tbody>
        {s.snaps.map((snap) => (
          <SnapRow key={snap.name} s={snap} s2={s} canAct={canAct} setConfirm={s.setConfirm} />
        ))}
      </tbody>
    </table>
  );
}
