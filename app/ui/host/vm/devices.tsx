/** Host USB passthrough and 9p shared directories for one host VM. */

'use client';

import { Empty } from '@/app/ui/loaders';
import { Field } from '../shared';
import { fieldValue } from './form';
import type { Detail, Op } from './types';

export function HostdevCard({ vm, busy, op }: { vm: Detail; busy: string; op: Op }) {
  const detach = (index: number, label: string) => {
    if (confirm(`detach ${label}?`)) void op({ op: 'hostdevDetach', index }, 'detach hostdev');
  };
  const attach = () => {
    void op({ op: 'hostdevAttach', vendor: fieldValue('hv'), product: fieldValue('hp') }, 'attach hostdev');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>host devices</h3>
      {vm.hostdevs.length === 0 ? <Empty text="no passthrough devices" /> : (
        <table>
          <thead><tr><th>kind</th><th>device</th><th /></tr></thead>
          <tbody>
            {vm.hostdevs.map((hostdev, index) => (
              <tr key={index}><td>{hostdev.kind}</td><td className="mono">{hostdev.label}</td>
                <td style={{ textAlign: 'right' }}>
                  <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy} onClick={() => detach(index, hostdev.label)}>detach</button>
                </td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="usb vendor"><input id="hv" style={{ width: 90 }} placeholder="046d" className="mono" /></Field>
        <Field label="product"><input id="hp" style={{ width: 90 }} placeholder="c52b" className="mono" /></Field>
        <button disabled={!!busy} onClick={attach}>attach usb device</button>
      </div>
    </div>
  );
}

export function DirsCard({ vm, busy, op }: { vm: Detail; busy: string; op: Op }) {
  const detach = (tag: string) => {
    if (confirm(`unshare ${tag}?`)) void op({ op: 'dirDetach', tag }, 'remove share');
  };
  const attach = () => {
    void op({ op: 'dirAttach', source: fieldValue('ds'), tag: fieldValue('dt') }, 'share dir');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>shared dirs</h3>
      {vm.dirs.length === 0 ? <Empty text="none" /> : (
        <table>
          <thead><tr><th>tag</th><th>source</th><th>mode</th><th /></tr></thead>
          <tbody>
            {vm.dirs.map((dir) => (
              <tr key={dir.target}><td className="mono">{dir.target}</td><td className="mono muted">{dir.source}</td>
                <td>{dir.readonly ? 'read-only' : 'read-write'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy} onClick={() => detach(dir.target)}>remove</button>
                </td></tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="host path"><input id="ds" style={{ width: 220 }} placeholder="/mnt/8tbv1/share" className="mono" /></Field>
        <Field label="guest tag"><input id="dt" style={{ width: 100 }} placeholder="share" className="mono" /></Field>
        <button disabled={!!busy} onClick={attach}>share</button>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>9p mount: in the guest, <span className="mono">mount -t 9p -o trans=virtio &lt;tag&gt; /mnt/x</span></div>
    </div>
  );
}
