/** Edit state and save for the quota editor. */

'use client';

import { useState } from 'react';
import { asInput, FIELDS, type Row } from './types';

/** Draft of the five numeric bounds plus the suspended flag. */
export function useQuotaEdit(onSaved: () => void): {
  open: string | null;
  draft: Record<string, string>;
  setDraft: (value: Record<string, string>) => void;
  suspended: boolean;
  setSuspended: (value: boolean) => void;
  busy: boolean;
  msg: string;
  toggle: (row: Row) => void;
  save: (row: Row) => Promise<void>;
} {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [suspended, setSuspended] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const startEdit = (row: Row) => {
    setOpen(row.userId);
    const draftMap: Record<string, string> = {};
    for (const field of FIELDS) draftMap[field.key] = asInput(row.quota[field.key] as number | null);
    setDraft(draftMap);
    setSuspended(row.quota.suspended);
    setMsg('');
  };

  const toggle = (row: Row) => {
    if (open === row.userId) setOpen(null);
    else startEdit(row);
  };

  const save = async (row: Row) => {
    setBusy(true);
    setMsg('');
    try {
      const body: Record<string, unknown> = { suspended };
      for (const field of FIELDS) {
        const raw = draft[field.key] ?? '';
        // Blank string -> null (unlimited). Must be explicit, not undefined, or
        // the API's "leave as-is" branch would silently keep the old bound.
        body[field.key] = raw === '' ? null : Number(raw);
      }
      const response = await fetch(`/api/quotas/${row.userId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMsg(payload.error ?? 'could not save');
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
