/**
 * Instance metrics panel: CPU, memory, disk and network charts.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChartBody } from './metrics/charts';
import { RANGES, fmtRate, type Payload } from './metrics/format';

/** The four headline numbers plus the range picker. */
function MetricsHead({ data, range, setRange }: {
  data: Payload | null; range: string; setRange: (r: string) => void;
}) {
  const latest = data?.points.length ? data.points[data.points.length - 1] : undefined;
  return (
    <div className="metrics-head">
      <div className="metrics-stats">
        <div className="metric">
          <div className="label">cpu now</div>
          <div className="value">{latest ? `${Math.round(latest.cpu)}%` : '—'}</div>
        </div>
        <div className="metric">
          <div className="label">disk read</div>
          <div className="value">{latest ? fmtRate(latest.read) : '—'}</div>
        </div>
        <div className="metric">
          <div className="label">disk write</div>
          <div className="value">{latest ? fmtRate(latest.write) : '—'}</div>
        </div>
        <div className="metric">
          <div className="label">memory allocated</div>
          <div className="value">{data?.ramAllocMb ? `${data.ramAllocMb} MB` : '—'}</div>
        </div>
      </div>
      <div className="metrics-ranges">
        {RANGES.map((r) => (
          <button
            key={r.k}
            className={`chip${range === r.k ? ' on' : ''}`}
            onClick={() => setRange(r.k)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Live metrics. Everything drawn here is measured by the hypervisor (vCPU
 * runtime and disk I/O counters), not estimated.
 *
 * Guest memory is deliberately NOT plotted. The balloon device reports
 * balloon.current == balloon.maximum on every guest here regardless of what
 * the guest actually uses — verified on both Ubuntu and Alpine — so plotting it
 * would produce a RAM line pinned at 100% forever. It is shown as "allocated"
 * instead, which is the truth, with the reason stated rather than hidden.
 */
export function MetricsPanel({ instanceId, instanceStatus }: { instanceId: string; instanceStatus: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [range, setRange] = useState<string>('1h');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/instances/${instanceId}/metrics?range=${range}`, { cache: 'no-store' });
      if (r.ok) setData(await r.json());
    } catch {
      /* retried on the next tick */
    } finally {
      setLoading(false);
    }
  }, [instanceId, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  const off = instanceStatus !== 'running';

  return (
    <div className="metrics">
      <MetricsHead data={data} range={range} setRange={setRange} />

      {off && (
        <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
          The instance is {instanceStatus}. Metrics are sampled only while it runs.
        </div>
      )}

      <ChartBody data={data} loading={loading} off={off} />
    </div>
  );
}
