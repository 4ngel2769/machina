/** Machines tab of the host console: every domain libvirt knows about. */

'use client';

import Link from 'next/link';
import { Ring, Empty } from '@/app/ui/loaders';
import { bytes } from '../shared';
import type { InstRow, Vm, VmPost } from './types';

/** Label for the button that flips a domain's power state. */
function powerLabel(running: boolean): string {
  return running ? 'shutdown' : 'start';
}

function ownerCell(v: Vm): React.ReactNode {
  if (v.system) return <span className="muted">system</span>;
  return v.owner?.name;
}

/** "2 / 4" when the domain can be hot-plugged above its running count. */
function cpuCell(v: Vm): string {
  const above = v.vcpuMax && v.vcpuMax !== v.vcpu ? ` / ${v.vcpuMax}` : '';
  return v.vcpu ? `${v.vcpu}${above}` : '—';
}

function memCell(v: Vm): string {
  return v.memMb ? `${Math.round(v.memMb / 1024)} GB` : '—';
}

function VmRow({ v, busy, vmPost }: { v: Vm; busy: string; vmPost: VmPost }) {
  const running = v.state === 'running';
  const action = powerLabel(running);
  const label = `${v.name} ${action}`;
  return (
    <tr key={v.name}>
      <td className="mono"><Link href={`/host/${encodeURIComponent(v.name)}`}>{v.name}</Link></td>
      <td><span className={`badge ${running ? 'running' : 'stopped'}`}>{v.state}</span></td>
      <td>{ownerCell(v)}</td>
      <td className="mono">{cpuCell(v)}</td>
      <td className="mono">{memCell(v)}</td>
      <td>{v.persistent ? 'defined' : 'transient'}</td>
      <td>{v.autostart ? 'yes' : <span className="muted">no</span>}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button disabled={!!busy} onClick={() => vmPost(v.name, { op: 'power', action }, label)}>
          {busy === label ? <Ring size={10} /> : running ? 'stop' : 'start'}
        </button>
        <Link href={`/host/${encodeURIComponent(v.name)}`} style={{ marginLeft: 8 }}>open</Link>
      </td>
    </tr>
  );
}

function OwnerSelect({ owner, setOwner, users, instances }: {
  owner: string;
  setOwner: (v: string) => void;
  users: InstRow[] | { id: string; name: string }[];
  instances: InstRow[];
}) {
  const owners = (users as { id: string; name: string }[]).filter((u) => instances.some((i) => i.uid === u.id));
  return (
    <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ maxWidth: 240 }}>
      <option value="visible">system + admin-owned</option>
      <option value="all">everything</option>
      {owners.map((u) => <option key={u.id} value={u.id}>owner: {u.name}</option>)}
    </select>
  );
}

export function Machines({ vms, users, instances, owner, setOwner, busy, vmPost }: {
  vms: Vm[];
  users: { id: string; name: string }[];
  instances: InstRow[];
  owner: string;
  setOwner: (v: string) => void;
  busy: string;
  vmPost: VmPost;
}) {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{vms.length} machine{vms.length === 1 ? '' : 's'}</h3>
        <OwnerSelect owner={owner} setOwner={setOwner} users={users} instances={instances} />
      </div>
      {vms.length === 0 ? <Empty text="no machines in this view" /> : (
        <table>
          <thead><tr>
            <th>name</th><th>state</th><th>owner</th><th>vCPU</th><th>RAM</th><th>boot</th><th>autostart</th><th />
          </tr></thead>
          <tbody>
            {vms.map((v) => <VmRow key={v.name} v={v} busy={busy} vmPost={vmPost} />)}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Total RAM in use, for the page subtitle. */
export function memSummary(host: { memTotalMb: number; memFreeMb: number }): string {
  const used = bytes((host.memTotalMb - host.memFreeMb) * 1048576);
  return `${used} of ${bytes(host.memTotalMb * 1048576)} RAM used`;
}
