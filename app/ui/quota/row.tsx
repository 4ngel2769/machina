/** Usage meter and the expanded edit row for the quota editor. */

'use client';

import { Ring } from '../loaders';
import type { useQuotaEdit } from './edit';
import { FIELDS, type Field, type Row } from './types';

type Edit = ReturnType<typeof useQuotaEdit>;

export function Meter({ used, max, label }: { used: number; max: number | null; label: string }) {
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

/** One usage meter per numeric bound, in FIELDS order. */
export function UsageMeters({ quota, usage }: { quota: Row['quota']; usage: Row['usage'] }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <Meter used={usage.vms} max={quota.maxVms} label="VMs" />
      <Meter used={usage.vcpus} max={quota.maxVcpus} label="vCPU" />
      <Meter used={usage.memoryMb} max={quota.maxMemoryMb} label="RAM" />
      <Meter used={usage.diskGb} max={quota.maxDiskGb} label="disk" />
    </div>
  );
}

function BoundInput({ f, edit }: { f: Field; edit: Edit }) {
  return (
    <label className="qfield">
      <span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
      <input
        value={edit.draft[f.key] ?? ''}
        placeholder="∞"
        inputMode="numeric"
        onChange={(e) => edit.setDraft({ ...edit.draft, [f.key]: e.target.value })}
      />
    </label>
  );
}

/** Expanded edit row: the five numeric bounds plus suspended. */
export function EditRow({ r, edit }: { r: Row; edit: Edit }) {
  return (
    <tr key={`${r.userId}-edit`}>
      <td colSpan={4} className="quotaedit">
        <div className="snappresets" style={{ marginBottom: 10 }}>
          {FIELDS.map((f) => <BoundInput key={f.key} f={f} edit={edit} />)}
          <label className="qfield">
            <span>suspended</span>
            <input
              type="checkbox"
              checked={edit.suspended}
              onChange={(e) => edit.setSuspended(e.target.checked)}
              style={{ width: 'auto' }}
            />
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={() => void edit.save(r)} disabled={edit.busy}>
            {edit.busy ? <Ring size={12} /> : null} save quota
          </button>
          <span className="muted" style={{ fontSize: 11 }}>
            blank = unlimited, 0 = may not create
          </span>
        </div>
        {edit.msg && <div className="notice err" style={{ marginTop: 8 }}>{edit.msg}</div>}
      </td>
    </tr>
  );
}

/** One account's read row plus its edit row when open. */
export function QuotaRows({ rows, edit }: { rows: Row[]; edit: Edit }) {
  return rows.map((r) => <QuotaRow key={r.userId} r={r} edit={edit} />);
}

function QuotaRow({ r, edit }: { r: Row; edit: Edit }) {
  const open = edit.open === r.userId;
  return (
    <>
      <tr>
        <td>
          <div>{r.name} {r.role === 'admin' && <span className="badge">admin</span>}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {(r.balanceCents / 100).toFixed(2)} credit
          </div>
        </td>
        <td><UsageMeters quota={r.quota} usage={r.usage} /></td>
        <td>
          {r.quota.suspended
            ? <span className="badge error">suspended</span>
            : <span className="badge ready">active</span>}
        </td>
        <td className="snapacts">
          <button onClick={() => edit.toggle(r)}>
            {open ? 'cancel' : 'set quota'}
          </button>
        </td>
      </tr>
      {open && <EditRow r={r} edit={edit} />}
    </>
  );
}
