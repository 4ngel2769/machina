/** Create-container form for the Docker tab. */

'use client';

import type { useContainerActions } from './actions';

type Actions = ReturnType<typeof useContainerActions>;

export function CreateForm({ form, setForm, busy, create, tenant = false }: Pick<Actions, 'form' | 'setForm' | 'busy' | 'create'> & { tenant?: boolean }) {
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: event.target.value });
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>create a container</h3>
      <div className="muted" style={{ marginBottom: 10 }}>
        {tenant
          ? 'Runs on your private docker network — no published ports, reachable only from this host.'
          : 'No host mounts, volumes, host networking, devices, or extra capabilities. Pin the image tag. Published ports are reachable on the host.'}
      </div>
      <div className="row">
        <label>name <input value={form.name} onChange={set('name')} placeholder="my-service" /></label>
        <label>image <input value={form.image} onChange={set('image')} placeholder="ghcr.io/org/app:1.2.3" style={{ width: 280 }} /></label>
        <label>memory MB <input type="number" min="128" max="8192" value={form.memory} onChange={set('memory')} style={{ width: 90 }} /></label>
        <label>CPUs <input type="number" min="0.1" max="8" step="0.1" value={form.cpus} onChange={set('cpus')} style={{ width: 70 }} /></label>
        {tenant ? null : (
          <>
            <label>network
              <select value={form.network} onChange={set('network')}>
                <option value="bridge">shared bridge</option>
                <option value="user">private tenant network</option>
              </select>
            </label>
            <label>ports host:container <input value={form.ports} onChange={set('ports')} placeholder="18080:8080,18443:8443" style={{ width: 200 }} /></label>
          </>
        )}
        <button disabled={!!busy || !form.name || !form.image} onClick={() => void create()}>{busy === 'create' ? 'creating…' : 'create'}</button>
      </div>
    </div>
  );
}
