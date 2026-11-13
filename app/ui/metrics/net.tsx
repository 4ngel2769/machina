/**
 * Bandwidth panel: this month's quota burn plus a rate chart from the
 * 15-minute net_samples series. Rates are bytes-per-second derived from the
 * deltas between consecutive samples, so a missing sample lengthens the
 * window instead of inventing a spike.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Empty } from '../loaders';
import { clock, fmtBytes, fmtRate } from './format';

type Sample = { ts: number; rxDelta: number; txDelta: number };
type NetPayload = {
  ok: boolean; month: string; rxBytes: number; txBytes: number;
  quotaGb: number; throttled: boolean; samples: Sample[];
};

const RANGES = [
  { key: '6h', label: '6h', ms: 6 * 3_600_000 },
  { key: '24h', label: '24h', ms: 24 * 3_600_000 },
  { key: '7d', label: '7d', ms: 7 * 86_400_000 },
] as const;

const tooltipStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--line)',
  borderRadius: 6, fontSize: 12, color: 'var(--text)',
} as const;

/** Deltas -> rates. Each point's rate is delta/elapsed-since-previous-sample. */
function toPoints(samples: Sample[], since: number) {
  const points: { t: number; rx: number; tx: number }[] = [];
  let prev: Sample | null = null;
  for (const sample of samples) {
    if (sample.ts < since) { prev = sample; continue; }
    if (prev) {
      const elapsed = Math.max(1, (sample.ts - prev.ts) / 1000);
      points.push({
        t: sample.ts,
        rx: (sample.rxDelta + prev.rxDelta) / 2 / elapsed, // average the two intervals
        tx: (sample.txDelta + prev.txDelta) / 2 / elapsed,
      });
    }
    prev = sample;
  }
  return points;
}

/** The monthly quota bar with rx/tx totals. */
function QuotaBar({ payload }: { payload: NetPayload }) {
  const usedGb = (payload.rxBytes + payload.txBytes) / 1024 ** 3;
  const pct = payload.quotaGb > 0 ? Math.min(100, (usedGb / payload.quotaGb) * 100) : 0;
  return (
    <div className="hostcap" style={{ marginBottom: 10 }}>
      <span>this month <strong>{usedGb.toFixed(2)} GB</strong> of <strong>{payload.quotaGb} GB</strong></span>
      <span style={{ flex: 1, minWidth: 120 }}>
        <span style={{ display: 'block', height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: payload.throttled ? 'var(--danger)' : 'var(--accent)' }} />
        </span>
      </span>
      {payload.throttled && <span style={{ color: 'var(--danger)' }}>throttled — over quota</span>}
      <span className="muted">rx {fmtBytes(payload.rxBytes)} · tx {fmtBytes(payload.txBytes)}</span>
    </div>
  );
}

function RangeChips({ range, setRange }: { range: string; setRange: (key: string) => void }) {
  return (
    <div className="metrics-ranges" style={{ marginBottom: 8 }}>
      {RANGES.map((r) => (
        <button key={r.key} className={`chip${range === r.key ? ' on' : ''}`} onClick={() => setRange(r.key)}>{r.label}</button>
      ))}
    </div>
  );
}

function RateChart({ points }: { points: { t: number; rx: number; tx: number }[] }) {
  return (
    <div className="chartbox">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="t" tickFormatter={clock} stroke="var(--text-3)" fontSize={10} tickLine={false} minTickGap={44} />
          <YAxis stroke="var(--text-3)" fontSize={10} tickLine={false} width={52} tickFormatter={(v) => fmtRate(Number(v))} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
            formatter={(value, name) => [fmtRate(Number(value)), name === 'rx' ? 'download' : 'upload']}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="rx" name="download" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="tx" name="upload" stroke="var(--warn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NetPanel({ instanceId, off }: { instanceId: string; off: boolean }) {
  const [payload, setPayload] = useState<NetPayload | null>(null);
  const [range, setRange] = useState<string>('24h');
  // "now" is captured when the poll lands, never in render — purity rules.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/instances/${instanceId}/net`, { cache: 'no-store' });
      if (response.ok) {
        setPayload(await response.json());
        setNow(Date.now());
      }
    } catch { /* next tick retries */ }
  }, [instanceId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const rangeMs = RANGES.find((r) => r.key === range)?.ms ?? RANGES[1].ms;
  const points = useMemo(
    () => (payload ? toPoints(payload.samples, now - rangeMs) : []),
    [payload, rangeMs, now],
  );

  return (
    <div style={{ marginTop: 22 }}>
      <div className="chartlabel">bandwidth</div>

      {payload && <QuotaBar payload={payload} />}
      <RangeChips range={range} setRange={setRange} />

      {off && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          The instance is not running. Network is metered only while it runs.
        </div>
      )}

      {points.length < 2 ? (
        <Empty text="Collecting bandwidth samples. Rates need two readings about 15 minutes apart." />
      ) : (
        <RateChart points={points} />
      )}
    </div>
  );
}
