/** Image library card: list, sync, import. */

'use client';

import { useEffect, useState } from 'react';
import type { AdminState } from '../use';
import type { DelReq, Img, InstReq, Plan } from '../types';

import { ThinkingOrb } from 'thinking-orbs';
import { Empty } from '@/app/ui/loaders';
import { BorderBeam } from 'border-beam';

function ImageRow({ image, post }: { image: Img; post: AdminState['post'] }) {
  return (
    <tr>
      <td>{image.name}</td>
      <td>
        <span className={`badge ${image.status}`}>
          {image.status === 'downloading' ? (
            <>
              <ThinkingOrb state="working" size={20} theme="dark" aria-label="downloading" />
            </>
          ) : null}
          {image.status}
        </span>
        {image.failure ? <div className="copy">{image.failure}</div> : null}
      </td>
      <td className="mono">{(image.sizeBytes / 1024 / 1024).toFixed(0)}MB</td>
      <td className="mono">{image.sha256 ? `${image.sha256.slice(0, 12)}…` : '—'}</td>
      <td>{image.updatedAt ? new Date(image.updatedAt).toLocaleString() : '—'}</td>
      <td><button onClick={() => void post({ op: 'syncImage', imageId: image.id }, `sync ${image.name}`)}>sync</button></td>
    </tr>
  );
}

export function ImagesCard({ admin }: { admin: AdminState }) {
  const [open, setOpen] = useState(false);
  const [imgId, setImgId] = useState('');
  const [imgName, setImgName] = useState('');
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const importImage = async () => {
    setBusy(true);
    try {
      await admin.importImage(imgId, imgName, imgFile, () => {
        setOpen(false); setImgId(''); setImgName(''); setImgFile(null);
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BorderBeam size="line" colorVariant="ice" active={admin.imgs.some((image) => image.status === 'downloading')} strength={0.9} theme="dark">
      <div className="card">
        <h3>images</h3>
        <table>
          <thead><tr><th>id</th><th>status</th><th>size</th><th>sha</th><th>updated</th><th /></tr></thead>
          <tbody>
            {admin.imgs.length === 0 && <tr><td colSpan={6}><Empty icon="hard-drive" text="no images in the library" /></td></tr>}
            {admin.imgs.map((image) => <ImageRow key={image.id} image={image} post={admin.post} />)}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setOpen((prev) => !prev)}>{open ? 'cancel' : 'import image'}</button>
          {open && (
            <div className="row" style={{ marginTop: 10, alignItems: 'flex-end', gap: 10 }}>
              <label>id<input style={{ width: 160 }} value={imgId} onChange={(event) => setImgId(event.target.value)} placeholder="my-distro-1" className="mono" /></label>
              <label>display name<input style={{ width: 200 }} value={imgName} onChange={(event) => setImgName(event.target.value)} placeholder="optional" /></label>
              <label>qcow2 file<input type="file" accept=".qcow2" onChange={(event) => setImgFile(event.target.files?.[0] ?? null)} /></label>
              <button disabled={busy || !imgId || !imgFile} onClick={() => void importImage()}>{busy ? 'uploading…' : 'upload'}</button>
            </div>
          )}
        </div>
      </div>
    </BorderBeam>
  );
}
