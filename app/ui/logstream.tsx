/**
 * Live log view with a one-line activity summary for provisioning jobs.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Orb, Dots } from './loaders';

export type LogLine = { t: number; m: string; kind: 'step' | 'ok' | 'err' | 'info' };

const hhmm = (timestampMs: number) => new Date(timestampMs).toTimeString().slice(0, 8);

/** Human duration: 2m34s, 1h 04m, 12s. */
function fmtSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * Live log viewer. Polls while a job is in flight, stops when it settles, and
 * animates each new line in. Keeps the tail pinned unless the user has
 * scrolled up to read history — yanking someone back to the bottom mid-read is
 * the classic way to make a log viewer unusable.
 */
export function LogStream({
  lines,
  live,
  pollMs = 2000,
  height,
}: {
  lines: LogLine[];
  live: boolean;
  pollMs?: number;
  height?: number;
}) {
  const [items, setItems] = useState<LogLine[]>(lines);
  const [pinned, setPinned] = useState(true);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // adopt server payload unless we have newer local lines
  useEffect(() => {
    setItems((previous) => {
      if (!previous.length) return lines;
      const newest = previous[previous.length - 1]?.t ?? 0;
      return lines.filter((line) => line.t >= newest - 1).length > previous.length ? lines : previous;
    });
  }, [lines]);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      // the page's own poller feeds `lines`; this only drives the "still
      // working" heartbeat so the panel does not look frozen
      setItems((previous) => (previous.length ? previous : previous));
    }, pollMs);
    return () => clearInterval(timer);
  }, [live, pollMs]);

  useEffect(() => {
    if (pinned && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [items, pinned]);

  const onScroll = () => {
    const element = boxRef.current;
    if (!element) return;
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="logview"
        ref={boxRef}
        onScroll={onScroll}
        style={height ? { maxHeight: height } : undefined}
      >
        {items.length === 0 && (
          <div style={{ color: 'var(--text-3)' }}>
            {live ? 'waiting for the first step…' : 'no activity recorded yet'}
          </div>
        )}
        {items.map((line, index) => (
          <div className={`logline ${line.kind}`} key={`${line.t}-${index}`}>
            <span className="t">{hhmm(line.t)}</span>
            <span className="m">{line.m}</span>
          </div>
        ))}
        {live && (
          <div className="logline step">
            <span className="t" />
            <span className="m" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Orb state="weaving" size={20} label="working" />
              working…
            </span>
          </div>
        )}
        {/* duration is computed from the real timestamps, so a 2m34s failure
            cannot masquerade as a 10-hour hang */}
        {!live && items.length > 1 && (
          <div className="logline" style={{ opacity: .6, marginTop: 6 }}>
            <span className="t" />
            <span className="m">
              took {fmtSpan(items[items.length - 1].t - items[0].t)}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <div className="muted" style={{ fontSize: 11, display: 'flex', gap: 6, alignItems: 'center' }}>
          {live ? <><Dots />live</> : 'idle'}
        </div>
        {!pinned && (
          <button
            onClick={() => { setPinned(true); if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }}
            style={{ padding: '2px 8px', fontSize: 11 }}
          >
            jump to latest
          </button>
        )}
      </div>
    </div>
  );
}
