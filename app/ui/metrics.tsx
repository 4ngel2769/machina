/**
 * Instance metrics panel: CPU, memory, disk and network charts.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChartBody } from './metrics/charts';
import { RANGES, fmtRate, type Payload } from './metrics/format';

/** The four headline numbers plus the range picker. */
function MetricsHead({ payload, range, setRange }: {
  payload: Payload | null; range: string; setRange: (value: string) => void;
}) {
  const latest = payload?.points.length ? payload.points[payload.points.length - 1] : undefined;
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
          <div className="value">{payload?.ramAllocMb ? `${payload.ramAllocMb} MB` : '—'}</div>
        </div>
      </div>
      <div className="metrics-ranges">
        {RANGES.map((rangeOption) => (
          <button
            key={rangeOption.key}
            className={`chip${range === rangeOption.key ? ' on' : ''}`}
            onClick={() => setRange(rangeOption.key)}
          >
            {rangeOption.label}
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
  const [payload, setPayload] = useState<Payload | null>(null);
  const [range, setRange] = useState<string>('1h');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/instances/${instanceId}/metrics?range=${range}`, { cache: 'no-store' });
      if (response.ok) setPayload(await response.json());
    } catch {
      /* retried on the next tick */
    } finally {
      setLoading(false);
    }
  }, [instanceId, range]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const off = instanceStatus !== 'running';

  return (
    <div className="metrics">
      <MetricsHead payload={payload} range={range} setRange={setRange} />

      {off && (
        <div className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
          The instance is {instanceStatus}. Metrics are sampled only while it runs.
        </div>
      )}

      <ChartBody payload={payload} loading={loading} off={off} />
    </div>
  );
}
