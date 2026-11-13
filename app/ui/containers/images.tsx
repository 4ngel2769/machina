/**
 * Images section for the Docker tab: inventory, pull and remove.
 *
 * Pull goes through the same registry allowlist and explicit-tag rule as
 * container create (parseImage in lib/host/docker-create) — the form cannot
 * ask for :latest any more than create can. Remove refuses images that still
 * have containers, which is docker's own rule surfaced as an error.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { bytes } from '@/app/ui/host/shared';
import { useToast } from '@/app/ui/toast';

export type ImageRow = {
  id: string; repo: string; tag: string; created: string;
  sizeMb: number; containers: number;
};

function useImages() {
  const toast = useToast();
  const [images, setImages] = useState<ImageRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [pullRef, setPullRef] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/containers/images', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? 'could not list images');
      setImages(body.images ?? []);
      setErr('');
    } catch (error) {
      setErr((error as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pull = async () => {
    const image = pullRef.trim();
    if (!image) return;
    setBusy('pull');
    try {
      const response = await fetch('/api/containers/images', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? 'pull failed');
      toast.ok(`pulled ${body.image ?? image}`);
      setPullRef('');
      await load();
    } catch (error) {
      toast.err((error as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (image: ImageRow) => {
    const ref = `${image.repo}:${image.tag}`;
    if (!confirm(`Remove ${ref}? This deletes the image, not running containers.`)) return;
    setBusy(ref);
    try {
      const response = await fetch(`/api/containers/images?ref=${encodeURIComponent(ref)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? 'remove failed');
      toast.ok(`removed ${ref}`);
      await load();
    } catch (error) {
      toast.err((error as Error).message);
    } finally {
      setBusy('');
    }
  };

  return { images, err, busy, pullRef, setPullRef, pull, remove, reload: load };
}

function ImageTable({ images, busy, onRemove }: {
  images: ImageRow[]; busy: string; onRemove: (image: ImageRow) => void;
}) {
  return (
    <table>
      <thead>
        <tr><th>repository</th><th>tag</th><th>id</th><th>size</th><th>containers</th><th>created</th><th /></tr>
      </thead>
      <tbody>
        {images.map((image) => (
          <tr key={`${image.repo}:${image.tag}`}>
            <td className="mono" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={image.repo}>{image.repo}</td>
            <td className="mono">{image.tag}</td>
            <td className="mono muted">{image.id}</td>
            <td className="mono">{bytes(image.sizeMb * 1048576)}</td>
            <td className="mono muted">{image.containers}</td>
            <td className="muted" style={{ fontSize: 12 }}>{image.created}</td>
            <td style={{ textAlign: 'right' }}>
              <button
                className="danger"
                disabled={!!busy || image.containers > 0}
                title={image.containers > 0 ? 'image is in use' : 'remove image'}
                onClick={() => onRemove(image)}
              >remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImagesSection() {
  const { images, err, busy, pullRef, setPullRef, pull, remove } = useImages();

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>images</h3>
        <span className="muted mono" style={{ fontSize: 11 }}>{images?.length ?? '…'} on host</span>
      </div>
      <PullForm pullRef={pullRef} setPullRef={setPullRef} busy={busy} onPull={() => void pull()} />
      {err && <div className="notice err" style={{ marginBottom: 8 }}>{err}</div>}
      {!images && !err && <div className="muted">reading images…</div>}
      {images && images.length === 0 && <div className="muted">no images</div>}
      {images && images.length > 0 && <ImageTable images={images} busy={busy} onRemove={(image) => void remove(image)} />}
    </div>
  );
}

function PullForm({ pullRef, setPullRef, busy, onPull }: {
  pullRef: string; setPullRef: (value: string) => void; busy: string; onPull: () => void;
}) {
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <input
          value={pullRef}
          onChange={(event) => setPullRef(event.target.value)}
          placeholder="ghcr.io/org/app:1.2.3"
          style={{ maxWidth: 340 }}
          aria-label="image to pull"
        />
        <button disabled={!!busy || !pullRef.trim()} onClick={onPull}>
          {busy === 'pull' ? 'pulling…' : 'pull'}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        explicit tag required — latest/main/master are refused, same rule as create
      </div>
    </div>
  );
}
