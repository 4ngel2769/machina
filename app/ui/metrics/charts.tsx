/** The two charts on the instance metrics panel. */

'use client';

import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Empty, Orb } from '../loaders';
import { clock, fmtBytes, fmtRate, type Payload, type Point } from './format';

const tooltipStyle = {
  background: 'var(--surface-2)', border: '1px solid var(--line)',
  borderRadius: 6, fontSize: 12, color: 'var(--text)',
} as const;

const timeAxis = (
  <XAxis
    dataKey="t" tickFormatter={clock} stroke="var(--text-3)" fontSize={10}
    tickLine={false} minTickGap={44}
  />
);

export function CpuChart({ points, ncpu }: { points: Point[]; ncpu: number }) {
  return (
    <>
      <div className="chartlabel">cpu · % of all {ncpu || 1} vCPU</div>
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="mcpu" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            {timeAxis}
            <YAxis
              domain={[0, 100]} stroke="var(--text-3)" fontSize={10}
              tickLine={false} width={44} unit="%"
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
              formatter={(value) => [`${Math.round(Number(value))}%`, 'cpu']}
            />
            <Area
              type="monotone" dataKey="cpu" stroke="var(--accent)"
              strokeWidth={1.5} fill="url(#mcpu)" isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function DiskChart({ points }: { points: Point[] }) {
  return (
    <>
      <div className="chartlabel">disk throughput · guest disk only</div>
      <div className="chartbox">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            {timeAxis}
            <YAxis
              stroke="var(--text-3)" fontSize={10} tickLine={false} width={44}
              tickFormatter={(value) => fmtRate(Number(value))}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
              formatter={(value, name) => [fmtRate(Number(value)), name === 'read' ? 'read' : 'write']}
            />
            <Line type="monotone" dataKey="read" stroke="var(--accent)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="write" stroke="var(--warn)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Loading and not-yet-enough-samples states, in place of the charts. */
function ChartWait({ loading, hasData, sampleCount, off }: {
  loading: boolean; hasData: boolean; sampleCount: number; off: boolean;
}): React.ReactNode {
  if (loading && !hasData) {
    return (
      <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Orb state="searching" size={20} /> reading metrics
        </span>
      </div>
    );
  }
  if (sampleCount < 2) {
    return (
      <Empty
        icon={off ? 'power' : 'activity'}
        text={off
          ? 'Start the instance and its load will be charted here.'
          : 'Collecting the first samples. A chart needs two readings, so give it about a minute.'}
      />
    );
  }
  return null;
}

/** The charts plus the footnote, or the loading/empty state in their place. */
export function ChartBody({ payload, loading, off }: {
  payload: Payload | null; loading: boolean; off: boolean;
}) {
  const points = payload?.points ?? [];
  const wait = ChartWait({ loading, hasData: !!payload, sampleCount: points.length, off });
  if (wait) return <>{wait}</>;
  return (
    <>
      <CpuChart points={points} ncpu={payload?.ncpu ?? 1} />
      <DiskChart points={points} />
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Disk in use {fmtBytes(payload?.allocBytes ?? 0)} · {points.length} sample points ·
        {' '}memory usage is not shown: the balloon device does not report it on these guests
        without the QEMU guest agent, which is intentionally not installed.
      </div>
    </>
  );
}

