'use client';

import { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';

/** Small shared bits for the host console. */

export function bytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${u[i]}`;
}

export const rate = (n: number): string => `${bytes(n)}/s`;

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
  const data = series.map((s, i) => {
    const prev = series[i - 1];
    const dt = prev ? (s.t - prev.t) / 1000 : 0;
    return {
      v: dt > 0 ? Math.max(0, ((s.rx + s.tx) - (prev.rx + prev.tx)) / dt) : 0,
    };
  });
  if (data.length < 2) return <div className="muted" style={{ height, fontSize: 10 }}>collecting…</div>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, 'dataMax']} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.2} fill="url(#hs)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Poll a JSON endpoint. Keeps the last good payload on a transient failure so
 *  a dropped poll does not blank the page. */
export function usePoll<T>(url: string, ms: number, enabled = true): { data: T | null; error: string; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const tick = useRef(0);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) { setError(j.error ?? 'request failed'); return; }
        setData(j as T);
        setError('');
      } catch {
        if (alive) setError('could not reach the server');
      }
      tick.current += 1;
    };
    void load();
    const t = enabled ? setInterval(load, ms) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [url, ms, enabled, nonce]);
  return { data, error, reload: () => setNonce((n) => n + 1) };
}
