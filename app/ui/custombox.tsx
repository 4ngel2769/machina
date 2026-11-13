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
import { Ring } from './loaders';

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
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [vcpu, setVcpu] = useState('2');
  const [ram, setRam] = useState('2048');
  const [unit, setUnit] = useState<'MB' | 'GB'>('MB');
  const [disk, setDisk] = useState('20');
  const [bw, setBw] = useState('0');
  const [capHours, setCapHours] = useState('12');
  const [rate, setRate] = useState('');
  const [imageId, setImageId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const ramMb = unit === 'GB' ? Math.round(Number(ram) * 1024) : Math.round(Number(ram));
    const body: Record<string, unknown> = {
      op: 'createCustomInstance',
      targetUserId: userId,
      name,
      vcpu: Number(vcpu),
      ramMb,
      diskGb: Number(disk),
      bandwidthGb: bw === '' ? 0 : Number(bw),
      monthlyCapMin: Math.round(Number(capHours || '12') * 60),
      imageId: imageId || undefined,
    };
    if (rate !== '') body.hourlyRateCents = Math.round(Number(rate) * 100);
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error ?? 'could not create the box');
        return;
      }
      toast.ok(`created ${j.name} · ${j.planId} · $${((j.rateHourlyCents ?? 0) / 100).toFixed(2)}/h`);
      setName('');
      setRate('');
      onCreated();
    } catch {
      setErr('could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="row">
        <div className="qfield">
          <span>user</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ width: 150 }}>
            <option value="">select user…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="qfield">
          <span>instance name</span>
          <input style={{ width: 150 }} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="a-z 0-9 -" autoComplete="off" />
        </div>
        <div className="qfield">
          <span>vCPU</span>
          <input style={{ width: 70 }} value={vcpu} onChange={(e) => setVcpu(e.target.value)}
            inputMode="numeric" className="mono" />
        </div>
        <div className="qfield">
          <span>RAM</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <input style={{ width: 84 }} value={ram} onChange={(e) => setRam(e.target.value)}
              inputMode="numeric" className="mono" />
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'MB' | 'GB')} style={{ width: 62 }}>
              <option value="MB">MB</option>
              <option value="GB">GB</option>
            </select>
          </div>
        </div>
        <div className="qfield">
          <span>disk (GB)</span>
          <input style={{ width: 76 }} value={disk} onChange={(e) => setDisk(e.target.value)}
            inputMode="numeric" className="mono" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="qfield">
          <span>bandwidth (GB/mo, 0 = ∞)</span>
          <input style={{ width: 96 }} value={bw} onChange={(e) => setBw(e.target.value)}
            inputMode="decimal" className="mono" />
        </div>
        <div className="qfield">
          <span>monthly cap (h)</span>
          <input style={{ width: 76 }} value={capHours} onChange={(e) => setCapHours(e.target.value)}
            inputMode="numeric" className="mono" />
        </div>
        <div className="qfield">
          <span>rate ($/h, blank = auto)</span>
          <input style={{ width: 96 }} value={rate} onChange={(e) => setRate(e.target.value)}
            placeholder="auto" inputMode="decimal" className="mono" />
        </div>
        <div className="qfield">
          <span>OS</span>
          <select value={imageId} onChange={(e) => setImageId(e.target.value)} style={{ width: 210 }}>
            <option value="">user&apos;s assigned / first ready</option>
            {images.filter((i) => i.status === 'ready').map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <button className="primary" type="submit" disabled={busy || !userId || !name}>
          {busy ? <Ring size={12} /> : null} create custom box
        </button>
      </div>

      <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        Auto rate = $0.05 per vCPU·h + $0.25 per GB RAM·h + $0.0005 per GB disk·h
        (a 2 vCPU / 2 GB / 20 GB box lands at $0.61/h). Override it if the box is not
        meant to be billed at that. Bandwidth 0 is unlimited, not zero.
      </div>
      {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
    </form>
  );
}
