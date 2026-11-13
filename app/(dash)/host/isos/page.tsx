/**
 * ISO library: every installer image on the host, with upload and delete.
 * Attach/eject happens per-VM on the host console's media tab; this page is
 * the shelf those images live on.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton } from '@/app/ui/loaders';

type Iso = { name: string; sizeMb: number; mtime: number; sha256: string | null };
type IsoList = { isos: Iso[]; maxIsoGb: number; maxIsoCount: number; maxIsoTotalGb: number };

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Upload bar: file picker + button, posts the raw body like the VM media tab. */
function UploadBar({ busy, onUpload }: { busy: boolean; onUpload: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
      <input
        ref={fileRef} type="file" accept=".iso" disabled={busy} aria-label="iso file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = '';
        }}
      />
      {busy && <span className="muted" style={{ fontSize: 12 }}>uploading…</span>}
    </div>
  );
}

function IsoCard({ iso, onDelete }: { iso: Iso; onDelete: (name: string) => void }) {
  return (
    <div className="card" style={{ padding: 14, margin: 0 }}>
      <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{iso.name}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {fmtSize(iso.sizeMb)} · {fmtDate(iso.mtime)}
        {iso.sha256 ? ` · sha256 ${iso.sha256.slice(0, 12)}…` : ' · no checksum'}
      </div>
      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <button onClick={() => onDelete(iso.name)}>delete</button>
      </div>
    </div>
  );
}

export default function IsosPage() {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<IsoList | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/isos', { cache: 'no-store' });
    if (response.status === 403) { router.replace('/home'); return; }
    if (response.ok) setList(await response.json());
    else toast.err('could not load the iso library');
  }, [toast, router]);

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30_000); return () => clearInterval(timer); }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    const response = await fetch(`/api/isos?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok(`${file.name} uploaded`); void load(); }
    else toast.err(body.error ?? 'upload failed');
  };

  const remove = async (name: string) => {
    if (!confirm(`delete ${name}? VMs using it will fail to boot.`)) return;
    const response = await fetch(`/api/isos?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { toast.ok(`${name} deleted`); void load(); }
    else toast.err(body.error ?? 'delete failed');
  };

  const isos = list?.isos ?? [];
  const totalMb = isos.reduce((sum, iso) => sum + iso.sizeMb, 0);

  return (
    <>
      <h1>iso library</h1>
      <div className="sub">
        installer images on the host · {isos.length}/{list?.maxIsoCount ?? '—'} files · {fmtSize(totalMb)}/{list?.maxIsoTotalGb ?? '—'} GB
      </div>

      <UploadBar busy={busy} onUpload={(file) => void upload(file)} />
      <IsoBody list={list} isos={isos} onDelete={(name) => void remove(name)} />
    </>
  );
}

function IsoBody({ list, isos, onDelete }: { list: IsoList | null; isos: Iso[]; onDelete: (name: string) => void }) {
  if (!list) return <Skeleton h={120} />;
  if (isos.length === 0) return <Empty icon="hard-drive" text="no isos yet — upload an installer image to attach it to a VM" />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {isos.map((iso) => <IsoCard key={iso.name} iso={iso} onDelete={onDelete} />)}
    </div>
  );
}
