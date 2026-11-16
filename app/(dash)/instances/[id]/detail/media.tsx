/** Tenant media tab: attached cdroms plus attach/detach against the ISO shelf. */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Empty, Skeleton } from '@/app/ui/loaders';
import { useToast } from '@/app/ui/toast';

type Iso = { name: string; sizeMb: number; ownerId: string | null };
type Drive = { target: string; bus: string; source: string | null };
type Media = { isos: Iso[]; drives: Drive[] };

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function MediaTab({ instanceId, running }: { instanceId: string; running: boolean }) {
  const toast = useToast();
  const [media, setMedia] = useState<Media | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/instances/${instanceId}/media`, { cache: 'no-store' });
    if (response.ok) setMedia(await response.json());
  }, [instanceId]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, string>) => {
    setBusy(true);
    const response = await fetch(`/api/instances/${instanceId}/media`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok(data.note ?? 'done'); void load(); }
    else toast.err(data.error ?? 'failed');
  };

  if (!media) return <Skeleton h={8} w="70%" />;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>optical drives</h3>
      {media.drives.length === 0 ? (
        <Empty icon="disc" text="no cdrom attached" />
      ) : (
        <table>
          <thead><tr><th>target</th><th>bus</th><th>media</th><th /></tr></thead>
          <tbody>
            {media.drives.map((drive) => (
              <tr key={drive.target}>
                <td className="mono">{drive.target}</td>
                <td>{drive.bus}</td>
                <td className="mono muted">{drive.source ?? '(empty)'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button disabled={busy} onClick={() => void post({ action: 'detach', target: drive.target })}>eject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <label className="muted" style={{ fontSize: 12 }}>insert iso</label>
        <select value={pick} onChange={(event) => setPick(event.target.value)} style={{ minWidth: 240 }}>
          <option value="">select…</option>
          {media.isos.map((iso) => (
            <option key={iso.name} value={iso.name}>{iso.name} · {fmtSize(iso.sizeMb)}{iso.ownerId === null ? ' · shelf' : ''}</option>
          ))}
        </select>
        <button disabled={busy || !pick} onClick={() => void post({ action: 'attach', iso: pick })}>
          {running ? 'swap in' : 'insert'}
        </button>
        <span className="muted" style={{ fontSize: 12 }}>
          {media.isos.length === 0 ? 'no isos on your shelf yet' : running ? 'swaps the live cdrom or adds one at next start' : 'stored in the VM config — boots at next start'}
        </span>
      </div>
    </div>
  );
}
