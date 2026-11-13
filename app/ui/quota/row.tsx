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
  const percent = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  // Over the line is the only state that needs a colour; everything else is calm.
  const over = used > max;
  const fmt = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return (
    <span className="meter" title={`${label}: ${fmt(used)} of ${fmt(max)}`}>
      <span className="muted" style={{ fontSize: 11 }}>{label}</span>
      <span className={`bar${over ? ' over' : ''}`}>
        <span className="fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="mono" style={{ fontSize: 11 }}>{fmt(used)}/{fmt(max)}</span>
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
      <Meter used={usage.isos} max={quota.maxIsoCount} label="ISOs" />
      <Meter used={usage.isoGb} max={quota.maxIsoTotalGb} label="ISO GB" />
      <Meter used={usage.containers} max={quota.maxContainers} label="containers" />
      <Meter used={usage.containerMemMb} max={quota.maxContainerMemMb} label="ctr RAM" />
      <Meter used={usage.containerCpus} max={quota.maxContainerCpus} label="ctr vCPU" />
    </div>
  );
}

function BoundInput({ field, edit }: { field: Field; edit: Edit }) {
  return (
    <label className="qfield">
      <span>{field.label}{field.unit ? ` (${field.unit})` : ''}</span>
      <input
        value={edit.draft[field.key] ?? ''}
        placeholder="∞"
        inputMode="numeric"
        onChange={(event) => edit.setDraft({ ...edit.draft, [field.key]: event.target.value })}
      />
    </label>
  );
}

/** Expanded edit row: the five numeric bounds plus suspended. */
export function EditRow({ row, edit }: { row: Row; edit: Edit }) {
  return (
    <tr key={`${row.userId}-edit`}>
      <td colSpan={4} className="quotaedit">
        <div className="snappresets" style={{ marginBottom: 10 }}>
          {FIELDS.map((field) => <BoundInput key={field.key} field={field} edit={edit} />)}
          <label className="qfield">
            <span>suspended</span>
            <input
              type="checkbox"
              checked={edit.suspended}
              onChange={(event) => edit.setSuspended(event.target.checked)}
              style={{ width: 'auto' }}
            />
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={() => void edit.save(row)} disabled={edit.busy}>
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
  return rows.map((row) => <QuotaRow key={row.userId} row={row} edit={edit} />);
}

function QuotaRow({ row, edit }: { row: Row; edit: Edit }) {
  const open = edit.open === row.userId;
  return (
    <>
      <tr>
        <td>
          <div>{row.name} {row.role === 'admin' && <span className="badge">admin</span>}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {(row.balanceCents / 100).toFixed(2)} credit
          </div>
        </td>
        <td><UsageMeters quota={row.quota} usage={row.usage} /></td>
        <td>
          {row.quota.suspended
            ? <span className="badge error">suspended</span>
            : <span className="badge ready">active</span>}
        </td>
        <td className="snapacts">
          <button onClick={() => edit.toggle(row)}>
            {open ? 'cancel' : 'set quota'}
          </button>
        </td>
      </tr>
      {open && <EditRow row={row} edit={edit} />}
    </>
  );
}
