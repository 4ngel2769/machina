/**
 * Build a VM that is not on the ladder: cores, RAM (given in MB or GB), disk,
 * bandwidth and monthly cap, all as numbers rather than a preset id.
 *
 * The server turns this into a custom plan row and provisions through the same
 * path as everything else, so a custom box is subject to host capacity exactly
 * as a preset one is. The rate field is optional: blank means "compute it from
 * the configured coefficients", which the server echoes back in the toast.
 */

'use client';

import { useState } from 'react';
import { useToast } from './toast';
import { customBoxBody, useCustomBoxForm } from './custombox/form';
import { BillingRow, SpecRow } from './custombox/fields';

type Opt = { id: string; name: string };

export function CustomBox({
  users,
  images,
  onCreated,
}: {
  users: Opt[];
  images: { id: string; name: string; status: string }[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const { f, set, reset } = useCustomBoxForm();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(customBoxBody(f)),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? 'could not create the box');
        return;
      }
      toast.ok(`created ${j.name} · ${j.planId} · $${((j.rateHourlyCents ?? 0) / 100).toFixed(2)}/h`);
      reset();
      onCreated();
    } catch {
      setErr('could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <SpecRow f={f} set={set} users={users} />
      <BillingRow f={f} set={set} images={images} busy={busy} submit={submit} />

      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        Auto rate = $0.05 per vCPU·h + $0.25 per GB RAM·h + $0.0005 per GB disk·h
        (a 2 vCPU / 2 GB / 20 GB box lands at $0.61/h). Override it if the box is not
        meant to be billed at that. Bandwidth 0 is unlimited, not zero.
      </div>
      {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
    </form>
  );
}
