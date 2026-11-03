'use client';

import { useCallback, useEffect, useState } from 'react';
import { Orb, Ring, Empty } from './loaders';
import { relTime } from './time';

type Snap = {
  id: string;
  name: string;
  description: string;
  state: string;
  sizeBytes: number;
  current: boolean;
  createdAt: number;
  orphaned?: boolean;
};

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Names people reach for. A blank name is more likely to be a typo than a
 *  refusal, so offer the obvious ones rather than making them type. */
const PRESETS = ['clean', 'before-upgrade', 'pre-deploy'];

function fmtBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function SnapshotsPanel({
  instanceId,
  instanceStatus,
}: {
  instanceId: string;
  instanceStatus: string;
}) {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [disk, setDisk] = useState<{ actualBytes: number; freeMb: number } | null>(null);
  const [planDiskGb, setPlanDiskGb] = useState(0);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState<{ snap: Snap; mode: 'clean' | 'live' } | null>(null);

  const live = instanceStatus === 'running';
  const canAct = instanceStatus !== 'provisioning';

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/instances/${instanceId}/snapshots`, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setSnaps(j.snapshots ?? []);
      setDisk(j.disk ?? null);
      setPlanDiskGb(j.planDiskGb ?? 0);
      setLoaded(true);
    } catch {
      /* transient; the interval will retry */
    }
  }, [instanceId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(String(body.name));
    setMsg('');
    try {
      const r = await fetch(`/api/instances/${instanceId}/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error ?? 'that did not work');
        // A refusal here is almost always quota, so say what to do about it.
        if (/limit|free space|grown/i.test(j.error ?? '')) setMsg(`${j.error}. Delete a snapshot, or ask an admin to resize the disk.`);
      } else {
        setName('');
        setDesc('');
        setConfirm(null);
      }
    } catch {
      setMsg('could not reach the server');
    } finally {
      setBusy('');
      // let the worker get a moment before asking again
      setTimeout(() => void load(), 1500);
    }
  };

  const nameErr = name && !NAME_RE.test(name)
    ? 'lowercase letters, digits and dashes only'
    : '';

  return (
    <div className="snapwrap">
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

      {msg && <div className="notice err" style={{ marginBottom: 12 }}>{msg}</div>}

      {canAct && (
        <div className="snapnew">
          <div className="snappresets">
            {PRESETS.map((p) => (
              <button key={p} className="chip" onClick={() => setName(p)} disabled={Boolean(busy)}>
                {p}
              </button>
            ))}
          </div>
          <div className="snaprow">
            <input
              value={name}
              placeholder="snapshot name"
              onChange={(e) => setName(e.target.value.toLowerCase())}
              className={nameErr ? 'bad' : ''}
              disabled={Boolean(busy)}
            />
            <input
              value={desc}
              placeholder="note (optional)"
              onChange={(e) => setDesc(e.target.value)}
              disabled={Boolean(busy)}
            />
            <button
              className="primary"
              disabled={Boolean(busy) || !name || Boolean(nameErr)}
              onClick={() => void post({ action: 'create', name, description: desc })}
            >
              {busy && busy === name ? <Ring size={12} /> : null} take snapshot
            </button>
          </div>
          {nameErr && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{nameErr}</div>}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {live
              ? 'The instance is live, so the snapshot is taken while it keeps running.'
              : 'The instance is off, so the snapshot is taken cleanly.'}
          </div>
        </div>
      )}

      {confirm && (
        <div className="notice warn" style={{ marginBottom: 12 }}>
          <div>
            <strong>Roll back to &ldquo;{confirm.snap.name}&rdquo;?</strong>{' '}
            {confirm.mode === 'clean'
              ? 'The instance will be shut down first, its disk rolled back, then started again. Anything written since the snapshot is lost.'
              : 'The disk rolls back under the running guest, like pulling the power. Its filesystem may be left needing a repair on next boot.'}
            {' '}The snapshot captured the disk only, so the rolled-back filesystem is
            exactly as consistent as it was at the moment the snapshot was taken{' '}
            {confirm.mode === 'clean' && '(this snapshot was taken while the instance was running)'}.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              className="primary"
              onClick={() => void post({ action: 'revert', name: confirm.snap.name, mode: confirm.mode })}
              disabled={Boolean(busy)}
            >
              {busy ? <Ring size={12} /> : null} yes, roll back
            </button>
            <button onClick={() => setConfirm(null)} disabled={Boolean(busy)}>cancel</button>
          </div>
        </div>
      )}

      {!loaded ? (
        <div className="muted" style={{ padding: '18px 0' }}>loading snapshots…</div>
      ) : snaps.length === 0 ? (
        <Empty
          text="No snapshots yet. Take one before a risky upgrade so you can come back to it."
        />
      ) : (
        <table className="snaptable">
          <thead>
            <tr>
              <th>name</th><th>taken</th><th>state</th><th />
            </tr>
          </thead>
          <tbody>
            {snaps.map((s) => (
              <tr key={s.name}>
                <td>
                  <div className="mono">{s.name}</div>
                  {s.description && <div className="muted" style={{ fontSize: 12 }}>{s.description}</div>}
                </td>
                <td title={new Date(s.createdAt).toLocaleString()}>
                  {s.createdAt ? relTime(s.createdAt) : '—'}
                </td>
                <td>
                  {s.state === 'missing' ? (
                    <span className="badge err">gone</span>
                  ) : s.current ? (
                    <span className="badge running">current</span>
                  ) : (
                    <span className="badge">disk</span>
                  )}
                </td>
                <td className="snapacts">
                  <button
                    disabled={Boolean(busy) || !canAct || s.state === 'missing'}
                    onClick={() => setConfirm({ snap: s, mode: 'clean' })}
                    title="Shut the instance down, roll back, start it again"
                  >
                    roll back
                  </button>
                  <button
                    disabled={Boolean(busy) || !canAct || s.state === 'missing'}
                    onClick={() => setConfirm({ snap: s, mode: 'live' })}
                    title="Roll back without shutting down first"
                  >
                    roll back live
                  </button>
                  <button
                    className="danger"
                    disabled={Boolean(busy) || !canAct || s.state === 'missing'}
                    onClick={() => void post({ action: 'delete', name: s.name })}
                  >
                    delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}