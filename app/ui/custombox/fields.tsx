/** The two rows of inputs on the custom-box form. */

'use client';

import type { CustomBoxForm } from './form';
import { Ring } from '../loaders';

type Opt = { id: string; name: string };
type Set = <K extends keyof CustomBoxForm>(k: K, v: CustomBoxForm[K]) => void;

export function SpecRow({ f, set, users }: { f: CustomBoxForm; set: Set; users: Opt[] }) {
  return (
    <div className="row">
      <div className="qfield">
        <span>user</span>
        <select value={f.userId} onChange={(e) => set('userId', e.target.value)} style={{ width: 150 }}>
          <option value="">select user…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div className="qfield">
        <span>instance name</span>
        <input style={{ width: 150 }} value={f.name} onChange={(e) => set('name', e.target.value)}
          placeholder="a-z 0-9 -" autoComplete="off" />
      </div>
      <div className="qfield">
        <span>vCPU</span>
        <input style={{ width: 70 }} value={f.vcpu} onChange={(e) => set('vcpu', e.target.value)}
          inputMode="numeric" className="mono" />
      </div>
      <div className="qfield">
        <span>RAM</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 84 }} value={f.ram} onChange={(e) => set('ram', e.target.value)}
            inputMode="numeric" className="mono" />
          <select value={f.unit} onChange={(e) => set('unit', e.target.value as 'MB' | 'GB')} style={{ width: 62 }}>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
      </div>
      <div className="qfield">
        <span>disk (GB)</span>
        <input style={{ width: 76 }} value={f.disk} onChange={(e) => set('disk', e.target.value)}
          inputMode="numeric" className="mono" />
      </div>
    </div>
  );
}

export function BillingRow({ f, set, images, busy, submit }: {
  f: CustomBoxForm; set: Set;
  images: { id: string; name: string; status: string }[];
  busy: boolean; submit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <div className="qfield">
        <span>bandwidth (GB/mo, 0 = ∞)</span>
        <input style={{ width: 96 }} value={f.bw} onChange={(e) => set('bw', e.target.value)}
          inputMode="decimal" className="mono" />
      </div>
      <div className="qfield">
        <span>monthly cap (h)</span>
        <input style={{ width: 76 }} value={f.capHours} onChange={(e) => set('capHours', e.target.value)}
          inputMode="numeric" className="mono" />
      </div>
      <div className="qfield">
        <span>rate ($/h, blank = auto)</span>
        <input style={{ width: 96 }} value={f.rate} onChange={(e) => set('rate', e.target.value)}
          placeholder="auto" inputMode="decimal" className="mono" />
      </div>
      <div className="qfield">
        <span>OS</span>
        <select value={f.imageId} onChange={(e) => set('imageId', e.target.value)} style={{ width: 210 }}>
          <option value="">user&apos;s assigned / first ready</option>
          {images.filter((i) => i.status === 'ready').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>
      <button className="primary" type="submit" disabled={busy || !f.userId || !f.name}>
        {busy ? <Ring size={12} /> : null} create custom box
      </button>
    </div>
  );
}
