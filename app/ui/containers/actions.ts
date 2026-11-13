/** Actions for the Docker tab: lifecycle, logs, create, remove. */

'use client';

import { useState } from 'react';
import { useToast } from '@/app/ui/toast';
import type { Container } from './types';

/** "host:container" pairs from the comma separated form field. */
function parsePorts(spec: string): { host: number; container: number }[] {
  if (!spec.trim()) return [];
  return spec.split(',').map((s) => {
    const [host, container] = s.trim().split(':').map(Number);
    return { host, container };
  });
}

export function useContainerActions(reload: () => void): {
  busy: string;
  logs: Record<string, string>;
  openId: string | null;
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  form: { name: string; image: string; memory: string; cpus: string; ports: string };
  setForm: (v: { name: string; image: string; memory: string; cpus: string; ports: string }) => void;
  act: (c: Container, action: string) => Promise<void>;
  showLogs: (c: Container) => Promise<void>;
  create: () => Promise<void>;
  remove: (c: Container) => Promise<void>;
} {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', image: '', memory: '512', cpus: '1', ports: '' });

  const act = async (c: Container, action: string) => {
    setBusy(`${c.id}:${action}`);
    try {
      const r = await fetch(`/api/containers/${c.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? `${action} failed`);
      else toast.ok(`${c.name}: ${action}`);
      reload();
    } catch {
      toast.err(`${action}: could not reach the server`);
    } finally {
      setBusy('');
    }
  };

  const showLogs = async (c: Container) => {
    if (openId === c.id) { setOpenId(null); return; }
    setOpenId(c.id);
    if (logs[c.id]) return;
    try {
      const r = await fetch(`/api/containers/${c.id}?tail=200`, { cache: 'no-store' });
      const j = await r.json();
      setLogs((m) => ({ ...m, [c.id]: r.ok ? (j.logs || '(no output)') : (j.error ?? 'could not read logs') }));
    } catch {
      setLogs((m) => ({ ...m, [c.id]: 'could not reach the server' }));
    }
  };

  const create = async () => {
    setBusy('create');
    try {
      const ports = parsePorts(form.ports);
      const r = await fetch('/api/containers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name, image: form.image,
          memoryMb: Number(form.memory), cpus: Number(form.cpus), ports,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? 'create failed');
      else {
        toast.ok(`created ${form.name}`);
        setCreateOpen(false);
        setForm({ name: '', image: '', memory: '512', cpus: '1', ports: '' });
        reload();
      }
    } catch {
      toast.err('create: could not reach the server');
    } finally {
      setBusy('');
    }
  };

  const remove = async (c: Container) => {
    if (!c.managed || !confirm(`Remove ${c.name}? This deletes the container, not its image.`)) return;
    setBusy(`${c.id}:remove`);
    try {
      const r = await fetch(`/api/containers/${c.id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.err(j.error ?? 'remove failed');
      else { toast.ok(`removed ${c.name}`); reload(); }
    } catch {
      toast.err('remove: could not reach the server');
    } finally {
      setBusy('');
    }
  };

  return { busy, logs, openId, createOpen, setCreateOpen, form, setForm, act, showLogs, create, remove };
}
