'use client';

import { useState } from 'react';
import { Ring } from './loaders';

type Quota = {
  maxVms: number | null; maxVcpus: number | null; maxMemoryMb: number | null;
  maxDiskGb: number | null; maxRunning: number | null; suspended: boolean; note: string | null;
};
type Usage = { vms: number; running: number; vcpus: number; memoryMb: number; diskGb: number };
type Row = { userId: string; name: string; role: string; quota: Quota; usage: Usage; balanceCents: number };
type Props = {
  data: { rows: Row[]; host: unknown };
  onSaved: () => void;
};

/** "blank" is unlimited. The input holds a string precisely so an empty field
 *  is distinguishable from the literal 0 — 0 is a real answer (may not create)
 *  and coercing it to null would silently turn a denial into unlimited. */
const asInput = (v: number | null) => (v === null ? '' : String(v));

type Field = { key: keyof Quota; label: string; unit?: string };

const FIELDS: Field[] = [
  { key: 'maxVms', label: 'VMs' },
  { key: 'maxRunning', label: 'running' },
  { key: 'maxVcpus', label: 'vCPU' },
  { key: 'maxMemoryMb', label: 'RAM', unit: 'MB' },
  { key: 'maxDiskGb', label: 'disk', unit: 'GB' },
];

function Meter({ used, max, label }: { used: number; max: number | null; label: string }) {
  if (max === null) {
    return <span className="muted" style={{ fontSize: 11 }}>{label}: {used} (unlimited)</span>;
  }
  const p = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  // Over the line is the only state that needs a colour; everything else is calm.
  const over = used > max;
  return (
    <span className="meter" title={`${label}: ${used} of ${max}`}>
      <span className="muted" style={{ fontSize: 11 }}>{label}</span>
      <span className={`bar${over ? ' over' : ''}`}>
        <span className="fill" style={{ width: `${p}%` }} />
      </span>
      <span className="mono" style={{ fontSize: 11 }}>{used}/{max}</span>
    </span>
  );
}

export function QuotaEditor({ data, onSaved }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [suspended, setSuspended] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const startEdit = (r: Row) => {
    setOpen(r.userId);
    const d: Record<string, string> = {};
    for (const f of FIELDS) d[f.key] = asInput(r.quota[f.key] as number | null);
    setDraft(d);
    setSuspended(r.quota.suspended);
    setMsg('');
  };

  const save = async (r: Row) => {
    setBusy(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = { suspended };
      for (const f of FIELDS) {
        const v = draft[f.key] ?? '';
        // Blank string -> null (unlimited). Must be explicit, not undefined, or
        // the API's "leave as-is" branch would silently keep the old bound.
        body[f.key] = v === '' ? null : Number(v);
      }
      const res = await fetch(`/api/quotas/${r.userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? 'could not save');
      } else {
        setOpen(null);
        onSaved();
      }
    } catch {
      setMsg('could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <table className="quotatable">
      <thead>
        <tr><th>account</th><th>usage</th><th>state</th><th /></tr>
      </thead>
      <tbody>
        {data.rows.map((r) => (
          <>
            <tr key={r.userId}>
              <td>
                <div>{r.name} {r.role === 'admin' && <span className="badge">admin</span>}</div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {(r.balanceCents / 100).toFixed(2)} credit
                </div>
              </td>
              <td>
                <div style={{ display: 'grid', gap: 3 }}>
                  <Meter used={r.usage.vms} max={r.quota.maxVms} label="VMs" />
                  <Meter used={r.usage.vcpus} max={r.quota.maxVcpus} label="vCPU" />
                  <Meter used={r.usage.memoryMb} max={r.quota.maxMemoryMb} label="RAM" />
                  <Meter used={r.usage.diskGb} max={r.quota.maxDiskGb} label="disk" />
                </div>
              </td>
              <td>
                {r.quota.suspended
                  ? <span className="badge error">suspended</span>
                  : <span className="badge ready">active</span>}
              </td>
              <td className="snapacts">
                <button onClick={() => (open === r.userId ? setOpen(null) : startEdit(r))}>
                  {open === r.userId ? 'cancel' : 'set quota'}
                </button>
              </td>
            </tr>
            {open === r.userId && (
              <tr key={`${r.userId}-edit`}>
                <td colSpan={4} className="quotaedit">
                  <div className="snappresets" style={{ marginBottom: 10 }}>
                    {FIELDS.map((f) => (
                      <label key={f.key} className="qfield">
                        <span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
                        <input
                          value={draft[f.key] ?? ''}
                          placeholder="∞"
                          inputMode="numeric"
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      </label>
                    ))}
                    <label className="qfield">
                      <span>suspended</span>
                      <input
                        type="checkbox"
                        checked={suspended}
                        onChange={(e) => setSuspended(e.target.checked)}
                        style={{ width: 'auto' }}
                      />
                    </label>
                  </div>
                  <div className="row">
                    <button className="primary" onClick={() => void save(r)} disabled={busy}>
                      {busy ? <Ring size={12} /> : null} save quota
                    </button>
                    <span className="muted" style={{ fontSize: 11 }}>
                      blank = unlimited, 0 = may not create
                    </span>
                  </div>
                  {msg && <div className="notice err" style={{ marginTop: 8 }}>{msg}</div>}
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
}