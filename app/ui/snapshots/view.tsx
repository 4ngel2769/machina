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

export function SnapNew({ snapshots, live, canAct }: {
  snapshots: SnapshotsState; live: boolean; canAct: boolean;
}) {
  const nameErr = snapshots.name && !NAME_RE.test(snapshots.name)
    ? 'lowercase letters, digits and dashes only'
    : '';
  return (
    <div className="snapnew">
      <div className="snappresets">
        {PRESETS.map((preset) => (
          <button key={preset} className="chip" onClick={() => snapshots.setName(preset)} disabled={Boolean(snapshots.busy)}>
            {preset}
          </button>
        ))}
      </div>
      <div className="snaprow">
        <input
          value={snapshots.name}
          placeholder="snapshot name"
          onChange={(event) => snapshots.setName(event.target.value.toLowerCase())}
          className={nameErr ? 'bad' : ''}
          disabled={Boolean(snapshots.busy)}
        />
        <input
          value={snapshots.desc}
          placeholder="note (optional)"
          onChange={(event) => snapshots.setDesc(event.target.value)}
          disabled={Boolean(snapshots.busy)}
        />
        <button
          className="primary"
          disabled={Boolean(snapshots.busy) || !snapshots.name || Boolean(nameErr)}
          onClick={() => void snapshots.post({ action: 'create', name: snapshots.name, description: snapshots.desc })}
        >
          {snapshots.busy && snapshots.busy === snapshots.name ? <Ring size={12} /> : null} take snapshot
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

export function SnapConfirm({ snapshots, mode }: { snapshots: SnapshotsState; mode: ConfirmState }) {
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
          onClick={() => void snapshots.post({ action: 'revert', name: mode.snap.name, mode: mode.mode })}
          disabled={Boolean(snapshots.busy)}
        >
          {snapshots.busy ? <Ring size={12} /> : null} yes, roll back
        </button>
        <button onClick={() => snapshots.setConfirm(null)} disabled={Boolean(snapshots.busy)}>cancel</button>
      </div>
    </div>
  );
}

function StateBadge({ snap }: { snap: Snap }) {
  if (snap.state === 'missing') return <span className="badge err">gone</span>;
  if (snap.current) return <span className="badge running">current</span>;
  return <span className="badge">disk</span>;
}

function SnapRow({ snap, state, canAct, setConfirm }: {
  snap: Snap; state: SnapshotsState; canAct: boolean; setConfirm: (value: ConfirmState) => void;
}) {
  const dead = snap.state === 'missing';
  const dis = Boolean(state.busy) || !canAct || dead;
  return (
    <tr>
      <td>
        <div className="mono">{snap.name}</div>
        {snap.description && <div className="muted" style={{ fontSize: 12 }}>{snap.description}</div>}
      </td>
      <td title={new Date(snap.createdAt).toLocaleString()}>
        {snap.createdAt ? relTime(snap.createdAt) : '—'}
      </td>
      <td><StateBadge snap={snap} /></td>
      <td className="snapacts">
        <button
          disabled={dis}
          onClick={() => setConfirm({ snap, mode: 'clean' })}
          title="Shut the instance down, roll back, start it again"
        >
          roll back
        </button>
        <button
          disabled={dis}
          onClick={() => setConfirm({ snap, mode: 'live' })}
          title="Roll back without shutting down first"
        >
          roll back live
        </button>
        <button
          className="danger"
          disabled={dis}
          onClick={() => void state.post({ action: 'delete', name: snap.name })}
        >
          delete
        </button>
      </td>
    </tr>
  );
}

export function SnapTable({ snapshots, canAct }: { snapshots: SnapshotsState; canAct: boolean }) {
  if (!snapshots.loaded) return <div className="muted" style={{ padding: '18px 0' }}>loading snapshots…</div>;
  if (snapshots.snaps.length === 0) {
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
        {snapshots.snaps.map((snap) => (
          <SnapRow key={snap.name} snap={snap} state={snapshots} canAct={canAct} setConfirm={snapshots.setConfirm} />
        ))}
      </tbody>
    </table>
  );
}
