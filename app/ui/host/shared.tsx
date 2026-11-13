/** Small shared bits for the host console. */

'use client';

import { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

export function bytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / 1024 ** index;
  return `${value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[index]}`;
}

export const rate = (bytesPerSec: number): string => `${bytes(bytesPerSec)}/s`;

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="qfield">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** Rate sparkline from cumulative byte counters. */
export function Spark({ series, height = 34, color = 'var(--accent)' }:
  { series: { t: number; rx: number; tx: number }[]; height?: number; color?: string }) {
  const points = series.map((sample, index) => {
    const previous = series[index - 1];
    const elapsedSec = previous ? (sample.t - previous.t) / 1000 : 0;
    const received = sample.rx + sample.tx - (previous ? previous.rx + previous.tx : 0);
    return { rate: elapsedSec > 0 ? Math.max(0, received / elapsedSec) : 0 };
  });
  if (points.length < 2) return <div className="muted" style={{ height, fontSize: 10 }}>collecting…</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 'dataMax']} />
          <Area type="monotone" dataKey="rate" stroke={color} strokeWidth={1.2} fill="url(#hs)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Poll a JSON endpoint. Keeps the last good payload on a transient failure so
 *  a dropped poll does not blank the page. */
export function usePoll<T>(url: string, ms: number, enabled = true): { payload: T | null; error: string; reload: () => void } {
  const [payload, setPayload] = useState<T | null>(null);
  const [error, setError] = useState('');
  const tick = useRef(0);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const json = await response.json();
        if (!alive) return;
        if (!response.ok) { setError(json.error ?? 'request failed'); return; }
        setPayload(json as T);
        setError('');
      } catch {
        if (alive) setError('could not reach the server');
      }
      tick.current += 1;
    };
    void load();
    const timer = enabled ? setInterval(load, ms) : null;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [url, ms, enabled, nonce]);
  return { payload, error, reload: () => setNonce((nonce) => nonce + 1) };
}
