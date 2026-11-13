/** The two rows of inputs on the custom-box form. */

'use client';

import type { CustomBoxForm } from './form';
import { Ring } from '../loaders';

type Opt = { id: string; name: string };
type SetField = <K extends keyof CustomBoxForm>(key: K, value: CustomBoxForm[K]) => void;

export function SpecRow({ form, set, users }: { form: CustomBoxForm; set: SetField; users: Opt[] }) {
  return (
    <div className="row">
      <div className="qfield">
        <span>user</span>
        <select value={form.userId} onChange={(event) => set('userId', event.target.value)} style={{ width: 150 }}>
          <option value="">select user…</option>
          {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
      </div>
      <div className="qfield">
        <span>instance name</span>
        <input style={{ width: 150 }} value={form.name} onChange={(event) => set('name', event.target.value)}
          placeholder="a-z 0-9 -" autoComplete="off" />
      </div>
      <div className="qfield">
        <span>vCPU</span>
        <input style={{ width: 70 }} value={form.vcpu} onChange={(event) => set('vcpu', event.target.value)}
          inputMode="numeric" className="mono" />
      </div>
      <div className="qfield">
        <span>RAM</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <input style={{ width: 84 }} value={form.ram} onChange={(event) => set('ram', event.target.value)}
            inputMode="numeric" className="mono" />
          <select value={form.unit} onChange={(event) => set('unit', event.target.value as 'MB' | 'GB')} style={{ width: 62 }}>
            <option value="MB">MB</option>
            <option value="GB">GB</option>
          </select>
        </div>
      </div>
      <div className="qfield">
        <span>disk (GB)</span>
        <input style={{ width: 76 }} value={form.disk} onChange={(event) => set('disk', event.target.value)}
          inputMode="numeric" className="mono" />
      </div>
    </div>
  );
}

export function BillingRow({ form, set, images, busy, submit }: {
  form: CustomBoxForm; set: SetField;
  images: { id: string; name: string; status: string }[];
  busy: boolean; submit: (event: React.FormEvent) => void;
}) {
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <div className="qfield">
        <span>bandwidth (GB/mo, 0 = ∞)</span>
        <input style={{ width: 96 }} value={form.bw} onChange={(event) => set('bw', event.target.value)}
          inputMode="decimal" className="mono" />
      </div>
      <div className="qfield">
        <span>monthly cap (h)</span>
        <input style={{ width: 76 }} value={form.capHours} onChange={(event) => set('capHours', event.target.value)}
          inputMode="numeric" className="mono" />
      </div>
      <div className="qfield">
        <span>rate ($/h, blank = auto)</span>
        <input style={{ width: 96 }} value={form.rate} onChange={(event) => set('rate', event.target.value)}
          placeholder="auto" inputMode="decimal" className="mono" />
      </div>
      <div className="qfield">
        <span>OS</span>
        <select value={form.imageId} onChange={(event) => set('imageId', event.target.value)} style={{ width: 210 }}>
          <option value="">user&apos;s assigned / first ready</option>
          {images.filter((iso) => iso.status === 'ready').map((iso) => <option key={iso.id} value={iso.id}>{iso.name}</option>)}
        </select>
      </div>
      <button className="primary" type="submit" disabled={busy || !form.userId || !form.name}>
        {busy ? <Ring size={12} /> : null} create custom box
      </button>
    </div>
  );
}
