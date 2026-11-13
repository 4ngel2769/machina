/** Actions for the Docker tab: lifecycle, logs, create, remove.
 *
 * `apiBase` is '/api/containers' for the admin fleet view and
 * '/api/my-containers' for a tenant's own shelf — the same panel serves both,
 * the routes decide what is visible.
 */

'use client';

import { useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { Container } from './types';

/** "host:container" pairs from the comma separated form field. */
function parsePorts(spec: string): { host: number; container: number }[] {
  if (!spec.trim()) return [];
  return spec.split(',').map((pair) => {
    const [host, container] = pair.trim().split(':').map(Number);
    return { host, container };
  });
}

export function useContainerActions(reload: () => void, apiBase = '/api/containers'): {
  busy: string;
  logs: Record<string, string>;
  openId: string | null;
  createOpen: boolean;
  setCreateOpen: (value: boolean) => void;
  form: { name: string; image: string; memory: string; cpus: string; ports: string; network: 'bridge' | 'user' };
  setForm: (value: { name: string; image: string; memory: string; cpus: string; ports: string; network: 'bridge' | 'user' }) => void;
  act: (container: Container, action: string) => Promise<void>;
  showLogs: (container: Container) => Promise<void>;
  create: () => Promise<void>;
  remove: (container: Container) => Promise<void>;
} {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; image: string; memory: string; cpus: string; ports: string; network: 'bridge' | 'user' }>({ name: '', image: '', memory: '512', cpus: '1', ports: '', network: 'bridge' });

  const act = async (container: Container, action: string) => {
    setBusy(`${container.id}:${action}`);
    try {
      const response = await fetch(`${apiBase}/${container.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) toast.err(payload.error ?? `${action} failed`);
      else toast.ok(`${container.name}: ${action}`);
      reload();
    } catch {
      toast.err(`${action}: could not reach the server`);
    } finally {
      setBusy('');
    }
  };

  const showLogs = async (container: Container) => {
    if (openId === container.id) { setOpenId(null); return; }
    setOpenId(container.id);
    if (logs[container.id]) return;
    try {
      const response = await fetch(`${apiBase}/${container.id}?tail=200`, { cache: 'no-store' });
      const payload = await response.json();
      setLogs((previous) => ({ ...previous, [container.id]: response.ok ? (payload.logs || '(no output)') : (payload.error ?? 'could not read logs') }));
    } catch {
      setLogs((previous) => ({ ...previous, [container.id]: 'could not reach the server' }));
    }
  };

  const create = async () => {
    setBusy('create');
    try {
      const ports = parsePorts(form.ports);
      const response = await fetch(apiBase, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name, image: form.image,
          memoryMb: Number(form.memory), cpus: Number(form.cpus), ports,
          network: form.network,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) toast.err(payload.error ?? 'create failed');
      else {
        toast.ok(`created ${form.name}`);
        setCreateOpen(false);
        setForm({ name: '', image: '', memory: '512', cpus: '1', ports: '', network: 'bridge' as const });
        reload();
      }
    } catch {
      toast.err('create: could not reach the server');
    } finally {
      setBusy('');
    }
  };

  const remove = async (container: Container) => {
    if (!container.managed || !confirm(`Remove ${container.name}? This deletes the container, not its image.`)) return;
    setBusy(`${container.id}:remove`);
    try {
      // Admins DELETE; tenants POST {action:'remove'} — the routes differ.
      const tenant = apiBase !== '/api/containers';
      const response = tenant
        ? await fetch(`${apiBase}/${container.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove' }) })
        : await fetch(`${apiBase}/${container.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) toast.err(payload.error ?? 'remove failed');
      else { toast.ok(`removed ${container.name}`); reload(); }
    } catch {
      toast.err('remove: could not reach the server');
    } finally {
      setBusy('');
    }
  };

  return { busy, logs, openId, createOpen, setCreateOpen, form, setForm, act, showLogs, create, remove };
}
