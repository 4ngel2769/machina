/** ISO shelf: upload, list, delete — plus "attach to VM" straight from a tile. */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { DataGate } from '@/app/ui/datagate';
import { Empty, Skeleton, useMinVisible } from '@/app/ui/loaders';

type Iso = { name: string; sizeMb: number; mtime: number; sha256: string | null; ownerId: string | null };
type IsoList = {
  isos: Iso[];
  maxIsoGb: number;
  quota: { maxIsoCount: number | null; maxIsoTotalGb: number | null };
  usage: { count: number; totalGb: number };
};
type Vm = { id: string; name: string; status: string };

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** VM picker that posts the attach once a target is chosen. Hidden until used. */
function AttachMenu({ iso }: { iso: Iso }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vms, setVms] = useState<Vm[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || vms !== null) return;
    fetch('/api/instances', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: Vm[]) => setVms(rows.filter((vm) => !['provisioning', 'deleting'].includes(vm.status))))
      .catch(() => setVms([]));
  }, [open, vms]);

  const attach = async (vmId: string) => {
    setBusy(true);
    const response = await fetch(`/api/instances/${vmId}/media`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'attach', iso: iso.name }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setOpen(false);
    if (response.ok) toast.ok(`${iso.name} → ${body.note ?? 'attached'}`);
    else toast.err(body.error ?? 'attach failed');
  };

  if (!open) {
    return <button onClick={() => setOpen(true)}>attach</button>;
  }
  return (
    <select
      autoFocus disabled={busy || !vms?.length}
      defaultValue="" onBlur={() => setOpen(false)}
      onChange={(event) => { if (event.target.value) void attach(event.target.value); }}
      style={{ minWidth: 150 }}
    >
      <option value="">{vms === null ? 'loading…' : vms.length ? 'pick a VM…' : 'no VMs'}</option>
      {(vms ?? []).map((vm) => (
        <option key={vm.id} value={vm.id}>{vm.name} · {vm.status}</option>
      ))}
    </select>
  );
}

function IsoTile({ iso, onDelete }: { iso: Iso; onDelete: (iso: Iso) => void }) {
  const mine = iso.ownerId !== null;
  return (
    <div className="card" style={{ padding: 14, margin: 0 }}>
      <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{iso.name}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {fmtSize(iso.sizeMb)} · {fmtDate(iso.mtime)}
        {iso.ownerId === null ? ' · shared shelf' : ''}
      </div>
      <div style={{ marginTop: 10, textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <AttachMenu iso={iso} />
        {mine && <button onClick={() => onDelete(iso)}>delete</button>}
      </div>
    </div>
  );
}

function useMyIsos() {
  const toast = useToast();
  const [list, setList] = useState<IsoList | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/isos/mine', { cache: 'no-store' });
    if (response.ok) setList(await response.json());
    else toast.err('could not load your iso shelf');
  }, [toast]);

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    const response = await fetch(`/api/isos/mine?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok(`${file.name} uploaded`); void load(); }
    else toast.err(body.error ?? 'upload failed');
  }, [toast, load]);

  const remove = useCallback(async (iso: Iso) => {
    if (!confirm(`delete ${iso.name}? VMs using it will fail to boot.`)) return;
    const response = await fetch(`/api/isos/mine?name=${encodeURIComponent(iso.name)}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok(`${iso.name} deleted`); void load(); }
    else toast.err(body.error ?? 'delete failed');
  }, [toast, load]);

  return { list, busy, upload, remove };
}

function Shelf({ isos, onDelete }: { isos: Iso[]; onDelete: (iso: Iso) => void }) {
  if (isos.length === 0) {
    return <Empty icon="hard-drive" text="no isos yet — upload an installer image, then attach it from an instance" />;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {isos.map((iso) => <IsoTile key={iso.name} iso={iso} onDelete={onDelete} />)}
    </div>
  );
}

function cap(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `/${value}`;
}

function subline(list: IsoList | null): string {
  const count = list?.usage.count ?? '—';
  const total = list?.usage.totalGb ?? '—';
  return `your installer images · ${count}${cap(list?.quota.maxIsoCount)} files · ${total}${cap(list?.quota.maxIsoTotalGb)} GB`;
}

export default function MyIsosPage() {
  const { list, busy, upload, remove } = useMyIsos();
  const [mineOnly, setMineOnly] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ready = useMinVisible(400);

  const all = list?.isos ?? [];
  const own = all.filter((iso) => iso.ownerId !== null);
  const shown = mineOnly ? own : all;

  return (
    <>
      <h1>isos</h1>
      <div className="sub">{subline(list)}</div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          ref={fileRef} type="file" accept=".iso" disabled={busy} aria-label="iso file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
        <button onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'uploading…' : 'upload iso'}</button>
        <label className="muted" style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
          mine only
        </label>
      </div>

      <DataGate
        data={list} loading={!ready || list === null}
        isEmpty={() => shown.length === 0}
        emptyIcon="hard-drive" emptyText="no isos yet — upload an installer image, then attach it from an instance"
        skeleton={<Skeleton h={120} />}
      >
        {() => <Shelf isos={shown} onDelete={(iso) => void remove(iso)} />}
      </DataGate>
    </>
  );
}
