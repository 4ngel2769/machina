/** Network interfaces of one host VM: list and attach. */

'use client';

import { Field } from '../shared';
import { fieldValue } from './form';
import type { Detail, Op } from './types';

export function NicsCard({ vm, busy, op, netNames }: {
  vm: Detail; busy: string; op: Op; netNames: string[];
}) {
  const detach = (mac: string) => {
    if (confirm(`detach ${mac}?`)) void op({ op: 'nicDetach', mac }, 'detach nic');
  };
  const attach = () => {
    const net = fieldValue('nic-net');
    if (net) void op({ op: 'nicAttach', network: net }, 'attach nic');
  };
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>network interfaces</h3>
      <table>
        <thead><tr><th>mac</th><th>type</th><th>network</th><th>model</th><th /></tr></thead>
        <tbody>
          {vm.nics.map((nic) => (
            <tr key={nic.mac}>
              <td className="mono">{nic.mac}</td><td>{nic.type}</td><td className="mono">{nic.source}</td><td>{nic.model || 'default'}</td>
              <td style={{ textAlign: 'right' }}>
                <button style={{ color: 'var(--danger, #f87171)' }} disabled={!!busy} onClick={() => detach(nic.mac)}>detach</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <Field label="attach to network">
          <select id="nic-net" defaultValue={netNames[0] ?? ''} style={{ minWidth: 150 }}>
            {netNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
        <button disabled={!!busy || !netNames.length} onClick={attach}>attach interface</button>
      </div>
    </div>
  );
}
