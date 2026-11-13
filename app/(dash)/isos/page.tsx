/**
 * The caller's ISO shelf: upload, list and delete their own installer
 * images, bounded by their per-user tier (quotas) inside the global library
 * caps. Attach happens per-VM from the instance detail page.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton, useMinVisible } from '@/app/ui/loaders';

type Iso = { name: string; sizeMb: number; mtime: number; sha256: string | null; ownerId: string | null };
type IsoList = {
  isos: Iso[];
  maxIsoGb: number;
  quota: { maxIsoCount: number | null; maxIsoTotalGb: number | null };
  usage: { count: number; totalGb: number };
};

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
      <div style={{ marginTop: 10, textAlign: 'right' }}>
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

      {!ready || !list ? <Skeleton h={120} /> : <Shelf isos={shown} onDelete={(iso) => void remove(iso)} />}
    </>
  );
}
