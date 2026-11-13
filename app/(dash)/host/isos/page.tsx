/**
 * ISO library: every installer image on the host, with upload and delete.
 * Attach/eject happens per-VM on the host console's media tab; this page is
 * the shelf those images live on.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton, useMinVisible } from '@/app/ui/loaders';

type Iso = { name: string; sizeMb: number; mtime: number; sha256: string | null };
type IsoList = { isos: Iso[]; maxIsoGb: number; maxIsoCount: number; maxIsoTotalGb: number };
type IsoLimits = { maxIsoGb: number; maxIsoCount: number; maxIsoTotalGb: number };

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

/** Library caps, editable by admin. Stored server-side; the numbers shown in
 *  the page subtitle come from the same source, so what you see is enforced. */
function LimitsCard({ limits, onSaved }: { limits: IsoLimits | null; onSaved: (next: IsoLimits) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<IsoLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = draft ?? limits;
  if (!shown) return <div className="card"><Skeleton h={90} /></div>;

  const field = (key: keyof IsoLimits, label: string) => (
    <div style={{ flex: '1 1 140px', minWidth: 140 }}>
      <label htmlFor={`lim-${key}`}>{label}</label>
      <input
        id={`lim-${key}`} type="number" min={1} value={shown[key]}
        onChange={(event) => setDraft({ ...shown, [key]: Math.max(1, parseInt(event.target.value || '1', 10)) })}
      />
    </div>
  );

  const save = async () => {
    setBusy(true);
    const response = await fetch('/api/isos/limits', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(shown),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok('iso limits saved'); setDraft(null); onSaved(body); }
    else toast.err(body.error ?? 'save failed');
  };

  return (
    <div className="card">
      <h3>library limits</h3>
      <div className="sub" style={{ marginTop: -6, marginBottom: 12 }}>
        caps on the whole shelf — per-file size, file count and combined size. enforced on upload.
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {field('maxIsoGb', 'max file (GB)')}
        {field('maxIsoCount', 'max files')}
        {field('maxIsoTotalGb', 'max total (GB)')}
        <button className="primary" onClick={() => void save()} disabled={busy || !draft}>
          {busy ? 'saving…' : 'save limits'}
        </button>
      </div>
    </div>
  );
}

export default function IsosPage() {
  const toast = useToast();
  const router = useRouter();
  const [list, setList] = useState<IsoList | null>(null);
  const [limits, setLimits] = useState<IsoLimits | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = useMinVisible(400);

  const load = useCallback(async () => {
    const response = await fetch('/api/isos', { cache: 'no-store' });
    if (response.status === 403) { router.replace('/home'); return; }
    if (response.ok) {
      const body = await response.json();
      setList(body);
      setLimits({ maxIsoGb: body.maxIsoGb, maxIsoCount: body.maxIsoCount, maxIsoTotalGb: body.maxIsoTotalGb });
    } else toast.err('could not load the iso library');
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
      <LimitsCard limits={limits} onSaved={(next) => { setLimits(next); void load(); }} />
      <IsoBody ready={ready} list={list} isos={isos} onDelete={(name) => void remove(name)} />
    </>
  );
}

function IsoBody({ ready, list, isos, onDelete }: { ready: boolean; list: IsoList | null; isos: Iso[]; onDelete: (name: string) => void }) {
  if (!ready || !list) return <Skeleton h={120} />;
  if (isos.length === 0) return <Empty icon="hard-drive" text="no isos yet — upload an installer image to attach it to a VM" />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
      {isos.map((iso) => <IsoCard key={iso.name} iso={iso} onDelete={onDelete} />)}
    </div>
  );
}
