/**
 * Live logs tab: `docker logs -f` over the container WS. Binary frames are
 * raw stdout/stderr; {"t":"e"} frames surface as an error line. A "live"
 * toggle pauses the stream client-side without killing the docker process —
 * reconnecting replays the last N lines anyway.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/ui/toast';

type Line = { t: number; text: string };

async function mintLogsToken(id: string): Promise<string> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'logs' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!body?.token) throw new Error(body?.error ?? 'could not get a logs token');
  return body.token as string;
}

const hhmmss = (ms: number) => new Date(ms).toTimeString().slice(0, 8);

export function LogsPanel({ id, running }: { id: string; running: boolean }) {
  const toast = useToast();
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle');
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLPreElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    setState('connecting');
    void (async () => {
      try {
        const token = await mintLogsToken(id);
        if (cancelled) return;
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(
          `${protocol}://${location.host}/api/containers/${encodeURIComponent(id)}/logs?token=${token}&tail=500`,
        );
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        ws.onopen = () => { if (!cancelled) setState('open'); };
        ws.onmessage = (event) => {
          if (cancelled) return;
          if (event.data instanceof ArrayBuffer) {
            const text = new TextDecoder().decode(event.data);
            setLines((prev) => {
              const next = [...prev, ...text.split('\n').filter(Boolean).map((chunk) => ({ t: Date.now(), text: chunk }))];
              return next.length > 2000 ? next.slice(next.length - 2000) : next;
            });
            return;
          }
          try {
            const msg = JSON.parse(String(event.data)) as { t?: string; d?: string };
            if (msg.t === 'e') toast.err(msg.d ?? 'log stream error');
            if (msg.t === 'ready') setState('open');
          } catch { /* non-JSON text frame */ }
        };
        ws.onclose = () => { if (!cancelled) setState('closed'); };
        ws.onerror = () => { if (!cancelled) { setState('closed'); toast.err('log websocket error'); } };
      } catch (error) {
        if (!cancelled) { setState('closed'); toast.err((error as Error).message); }
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      try { wsRef.current?.close(); } catch { /* gone */ }
      wsRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines, follow]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 6, gap: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {state === 'open' ? 'live' : state}{running ? '' : ' — container not running, showing buffered logs'}
        </span>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          follow
        </label>
        <button style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }} onClick={() => setLines([])}>clear</button>
      </div>
      <pre
        ref={boxRef}
        className="mono"
        style={{
          height: 420, overflow: 'auto', margin: 0, padding: '10px 12px',
          background: '#050505', border: '1px solid var(--line)', borderRadius: 6,
          fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}
      >
        {lines.length === 0 && <span className="muted">waiting for output…</span>}
        {lines.map((line, index) => (
          <span key={index} style={{ display: 'block' }}>
            <span style={{ color: 'var(--text-3)' }}>{hhmmss(line.t)} </span>
            {line.text}
          </span>
        ))}
      </pre>
    </div>
  );
}
