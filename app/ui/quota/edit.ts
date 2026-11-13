/** Edit state and save for the quota editor. */

'use client';

import { useState } from 'react';
import { asInput, FIELDS, type Row } from './types';

/** Draft of the five numeric bounds plus the suspended flag. */
export function useQuotaEdit(onSaved: () => void): {
  open: string | null;
  draft: Record<string, string>;
  setDraft: (v: Record<string, string>) => void;
  suspended: boolean;
  setSuspended: (v: boolean) => void;
  busy: boolean;
  msg: string;
  toggle: (r: Row) => void;
  save: (r: Row) => Promise<void>;
} {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [suspended, setSuspended] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const startEdit = (r: Row) => {
    setOpen(r.userId);
    const d: Record<string, string> = {};
    for (const f of FIELDS) d[f.key] = asInput(r.quota[f.key] as number | null);
    setDraft(d);
    setSuspended(r.quota.suspended);
    setMsg('');
  };

  const toggle = (r: Row) => {
    if (open === r.userId) setOpen(null);
    else startEdit(r);
  };

  const save = async (r: Row) => {
    setBusy(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = { suspended };
      for (const f of FIELDS) {
        const v = draft[f.key] ?? '';
        // Blank string -> null (unlimited). Must be explicit, not undefined, or
        // the API's "leave as-is" branch would silently keep the old bound.
        body[f.key] = v === '' ? null : Number(v);
      }
      const res = await fetch(`/api/quotas/${r.userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(j.error ?? 'could not save');
      } else {
        setOpen(null);
        onSaved();
      }
    } catch {
      setMsg('could not reach the server');
    } finally {
      setBusy(false);
    }
  };

  return { open, draft, setDraft, suspended, setSuspended, busy, msg, toggle, save };
}
