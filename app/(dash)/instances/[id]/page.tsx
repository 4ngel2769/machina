'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import { copyText } from '@/app/ui/clipboard';
import { relTime } from '@/app/ui/time';
import { StatusCue } from '@/app/ui/status';
import { LogStream } from '@/app/ui/logstream';
import { SnapshotsPanel } from '@/app/ui/snapshots';
import { MetricsPanel } from '@/app/ui/metrics';
import { Ring, Orb, BarLoader } from '@/app/ui/loaders';

type Inst = {
  id: string; name: string; status: string; ip: string; mac: string;
  imageId: string; planId: string; rootPassword?: string;
  planName?: { name: string; vcpu: number; ramMb: number; diskGb: number } | null;
  autoSuspended: number; rateHourlyCents: number; createdAt: number;
  bw?: { month: string; rxBytes: number; txBytes: number; quotaGb: number; throttled: boolean };
  step?: string;
  problem?: string | null;
  healCount?: number;
  logLines?: { t: number; m: string; kind: 'step' | 'ok' | 'err' | 'info' }[];
};

function fmtGb(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(2);
}
type Job = { id: string; type: string; status: string; error: string; createdAt: number };
type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

function instanceIdFromPath(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.split('/')[2] ?? '';
}

export default function InstanceDetail() {
  const [inst, setInst] = useState<Inst | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tab, setTab] = useState<'term' | 'vnc' | 'metrics' | 'snapshots' | 'info' | 'logs'>('term');

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/instances/${id}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setInst(j);
      setJobs(j.jobs);
    } else {
      setMsg('instance gone');
    }
  }, []);

  useEffect(() => {
    const id = instanceIdFromPath();
    void load(id);
    const t = setInterval(() => void load(id), 5000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: string) => {
    setBusy(true);
    const id = instanceIdFromPath();
    const r = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${action} queued` : j.error ?? 'failed');
    setBusy(false);
    void load(instanceIdFromPath());
  };

  const clone = async () => {
    const name = window.prompt('name for the clone (3-41 chars: letters, digits, dot, dash, underscore)');
    if (!name) return;
    setBusy(true);
    const id = instanceIdFromPath();
    const r = await fetch(`/api/instances/${id}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'clone', name }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.note ?? 'clone queued') : j.error ?? 'clone failed');
    setBusy(false);
    void load(instanceIdFromPath());
  };

  const exportDisk = async () => {
    setBusy(true);
    const id = instanceIdFromPath();
    try {
      const r = await fetch(`/api/instances/${id}/export`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error ?? 'export failed'); return; }
      const a = document.createElement('a');
      a.href = j.url;
      a.download = j.filename ?? `${id}.qcow2`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setMsg('export started — the link expires in 5 minutes');
    } finally {
      setBusy(false);
    }
  };

  if (!inst) return <h1>{msg || 'loading…'}</h1>;

  return (
    <>
      <h1>{inst.name}</h1>
      <div className="sub">
        <span className="mono">{inst.id}</span> · {inst.planName?.name ?? inst.planId} · {inst.imageId}
      </div>

      <div className="card">
        <div className="row" style={{ gap: 14 }}>
          <span className={`badge ${inst.status}`}>
            {['provisioning', 'queued'].includes(inst.status) ? <StatusCue status={inst.status} /> : null}
            {inst.status}
          </span>
          {inst.ip
            ? <span
                data-copy
                title={`${inst.ip} — click to copy`}
                className="mono"
                onClick={() => void copyText(inst.ip, null)}
              >{inst.ip}</span>
            : null}
          <span className="mono" style={{ color: 'var(--accent)' }}>${(inst.rateHourlyCents / 100).toFixed(2)}/h</span>
          {inst.bw && inst.bw.quotaGb > 0
            ? <span className="mono muted">bw {fmtGb(inst.bw.rxBytes + inst.bw.txBytes)}/{inst.bw.quotaGb}GB</span>
            : null}
          {inst.bw?.throttled ? <span className="badge suspended">throttled</span> : null}
          {inst.autoSuspended ? <span className="badge suspended">auto-suspended</span> : null}
          <div className="spacer" />
          {['running', 'suspended'].includes(inst.status)
            ? <button disabled={busy} onClick={() => act('stop')}>stop</button> : null}
          {['stopped', 'suspended', 'error'].includes(inst.status)
            ? <button disabled={busy} onClick={() => act('start')}>start</button> : null}
          {['stopped', 'suspended', 'error'].includes(inst.status)
            ? <button disabled={busy} onClick={() => void clone()}>clone</button> : null}
          {['stopped', 'suspended', 'error'].includes(inst.status)
            ? <button disabled={busy} onClick={() => void exportDisk()}>export</button> : null}
          {['stopped', 'suspended', 'running', 'error'].includes(inst.status)
            ? <button className="danger" disabled={busy} onClick={() => act('delete')}>delete</button> : null}
        </div>
        {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
        {inst.status === 'provisioning' && inst.step && (
          <div className="busybtn" style={{ marginTop: 10, color: 'var(--text-2)', fontSize: 13 }}>
            <Orb state="weaving" size={20} label="provisioning" />
            {inst.step}…
          </div>
        )}
        {inst.status === 'provisioning' && <div style={{ marginTop: 10 }}><BarLoader label="provisioning" /></div>}
        {inst.problem && (
          <div className="errbox" style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <Orb state="solving" size={20} label="error" />
              <span>
                {inst.problem}
                {(inst.healCount ?? 0) > 0 && <span className="muted"> · auto-recovery attempt {inst.healCount} of 3</span>}
              </span>
            </span>
            <button onClick={() => act('retry')} disabled={busy} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {busy ? <Ring size={11} /> : null} try again
            </button>
          </div>
        )}
      </div>

      <div className="tabs">
        {(['term', 'vnc', 'metrics', 'snapshots', 'info', 'logs'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>
            {t === 'term' ? 'terminal' : t === 'vnc' ? 'console (VNC)' : t === 'metrics' ? 'metrics' : t === 'snapshots' ? 'snapshots' : t === 'info' ? 'information' : 'activity'}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'term' && (inst.status === 'running'
          ? <Terminal instanceId={inst.id} />
          : <div className="muted">terminal available when running</div>)}
        {tab === 'vnc' && (inst.status === 'running'
          ? <Console instanceId={inst.id} />
          : <div className="muted">console available when running</div>)}
        {tab === 'snapshots' && (
          <SnapshotsPanel instanceId={inst.id} instanceStatus={inst.status} />
        )}
        {tab === 'metrics' && (
          <MetricsPanel instanceId={inst.id} instanceStatus={inst.status} />
        )}
        {tab === 'logs' && (
          <LogStream lines={inst.logLines ?? []} live={inst.status === 'provisioning'} height={340} />
        )}
        {tab === 'info' && (
          <div>
            <dl className="kv">
              <dt>root password</dt>
              <dd className="mono" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {showPw ? (
                  <>
                    <span>{inst.rootPassword ?? '(hidden)'}</span>
                    {inst.rootPassword
                      ? <button onClick={() => void copyText(inst.rootPassword!, null)} style={{ padding: '2px 8px' }}>copy</button>
                      : null}
                  </>
                ) : (
                  <button onClick={() => setShowPw(true)} style={{ padding: '2px 8px' }}>reveal</button>
                )}
              </dd>
              <dt>mac</dt><dd className="mono">{inst.mac}</dd>
              <dt>created</dt><dd title={new Date(inst.createdAt).toLocaleString()}>{relTime(inst.createdAt)}</dd>
            </dl>
            <h3 style={{ marginTop: 18 }}>recent jobs</h3>
            <table>
              <thead><tr><th>type</th><th>status</th><th>error</th><th>at</th></tr></thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>{j.type}</td>
                    <td><span className={`badge ${j.status}`}>{j.status}</span></td>
                    <td className="copy">{j.error || '—'}</td>
                    <td title={new Date(j.createdAt).toLocaleString()}>{relTime(j.createdAt)}</td>
                  </tr>
                ))}
                {jobs.length === 0 && <tr><td colSpan={4} className="empty">no jobs yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ terminal

function Terminal({ instanceId }: { instanceId: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const connRef = useRef<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sizePushRef = useRef<(() => void) | null>(null);
  const termRef = useRef<import('@xterm/xterm').Terminal | null>(null);
  const fitRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const aliveRef = useRef(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const [state, setState] = useState<WsState>('idle');
  const [err, setErr] = useState('');
  const [persist, setPersist] = useState(true);

  /**
   * Reconnect on an unexpected close. The server heartbeat stops the routine
   * case (proxy idle reaping), but a dropped tunnel, a NAT rebind or a slept
   * laptop still disconnect, and previously that left a dead terminal until
   * the user navigated away. Backoff caps at 10s so it cannot hammer the
   * origin if the instance itself is gone.
   */
  const scheduleReconnect = useCallback(() => {
    if (!aliveRef.current) return;
    if (retryRef.current) return;
    const delay = Math.min(1000 * 2 ** triesRef.current, 10_000);
    triesRef.current = Math.min(triesRef.current + 1, 4);
    setState('closed');
    termRef.current?.write('\r\n\x1b[2m— connection lost, reconnecting…\x1b[0m\r\n');
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      void connectRef.current?.();
    }, delay);
  }, []);

  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const connect = useCallback(async () => {
    if (connRef.current || !aliveRef.current) return;
    setState('connecting');
    setErr('');
    try {
      const [{ Terminal }, { FitAddon }, xtermCss] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/xterm/css/xterm.css'),
      ]);
      void xtermCss;

      // ONE xterm instance for the lifetime of the mount. Reconnecting swaps the
      // websocket only, so scrollback survives a drop instead of being wiped.
      if (!termRef.current) {
        const t = new Terminal({
          cursorBlink: true, fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
          scrollback: 5000,
        });
        const f = new FitAddon();
        t.loadAddon(f);
        termRef.current = t;
        fitRef.current = f;

        // Handlers bind ONCE, against wsRef — never per socket. Per-connect
        // bindings stacked a listener per reconnect and sent resizes to dead
        // sockets. xterm also only emits onResize when the grid actually
        // changes, so the initial size must be pushed explicitly.
        t.onData((d) => {
          const w = wsRef.current;
          if (w && w.readyState === WebSocket.OPEN) {
            w.send(JSON.stringify({ t: 'i', d: btoa(unescape(encodeURIComponent(d))) }));
          }
        });
        const pushSize = () => {
          const w = wsRef.current;
          const term = termRef.current;
          if (w && w.readyState === WebSocket.OPEN && term && term.element) {
            w.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }));
          }
        };
        t.onResize(() => pushSize());
        sizePushRef.current = pushSize;
      }
      const term = termRef.current;

      const tok = await (await fetch(`/api/instances/${instanceId}/ws-token`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'term' }),
      })).json();
      if (!tok?.token) throw new Error(tok?.error ?? 'could not get a terminal token');

      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      // Fit first when possible so the multiplexer spawns at the real grid
      // size; the 'r' push right after open corrects any drift anyway.
      try { fitRef.current?.fit(); } catch { /* not laid out */ }
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const ws = new WebSocket(`${proto}://${location.host}/api/instances/${instanceId}/terminal?token=${tok.token}&persist=${persist ? 1 : 0}&cols=${cols}&rows=${rows}`);
      ws.binaryType = 'arraybuffer'; // server streams stdout as binary frames
      connRef.current = ws;
      wsRef.current = ws;

      // Re-fit after layout settles, then push the real size. fit() called
      // synchronously after open() can measure a not-yet-laid-out box and
      // leave xterm at its 80x24 default — that default is what used to
      // reach the guest PTY.
      const fitAndPush = () => {
        try { fitRef.current?.fit(); } catch { /* hidden or mid-layout */ }
        requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch { /* retry on next trigger */ } });
        sizePushRef.current?.();
      };

      ws.onopen = () => {
        const box = boxRef.current;
        if (!box) return;
        if (!term.element?.parentElement) { box.innerHTML = ''; term.open(box); }
        fitAndPush();
        triesRef.current = 0;
        setState('open');
        setErr('');
        // A shell is a new session, not the old one resumed. Say so, or the
        // user types into a prompt that no longer has their history.
        term.write('\r\n\x1b[2m— connected\x1b[0m\r\n');
      };
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) { termRef.current?.write(new Uint8Array(ev.data)); return; }
        if (typeof ev.data === 'string') {
          try {
            const j = JSON.parse(ev.data) as { t: string; d?: string };
            if (j.t === 'e') setErr(j.d ?? 'terminal error');
          } catch { /* ignore */ }
        }
      };
      ws.onclose = () => {
        if (connRef.current === ws) connRef.current = null;
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      };
      ws.onerror = () => { setErr('websocket error'); };
    } catch (e) {
      setErr(String((e as Error).message));
      connRef.current = null;
      scheduleReconnect();
    }
  }, [instanceId, persist, scheduleReconnect]);
  connectRef.current = connect;

  useEffect(() => {
    aliveRef.current = true;
    void connect();
    // Returning to a backgrounded tab is exactly when a dropped socket must be
    // repaired, and it is also the one moment the browser is not throttling
    // timers — so reconnect at once instead of waiting out the backoff.
    // Browser resizes and tab wakes both change what fit() should measure;
    // push the new grid to the guest either way.
    const onResize = () => {
      try { fitRef.current?.fit(); } catch { /* hidden */ }
      sizePushRef.current?.();
    };
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      onResize();
      const c = connRef.current;
      if (c && (c.readyState === WebSocket.OPEN || c.readyState === WebSocket.CONNECTING)) return;
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      triesRef.current = 0;
      void connectRef.current?.();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      try { connRef.current?.close(); } catch { /* already gone */ }
      connRef.current = null;
      wsRef.current = null;
      sizePushRef.current = null;
      try { termRef.current?.dispose(); } catch { /* already gone */ }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [connect]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button
          onClick={() => void connect()}
          disabled={state === 'connecting' || state === 'open'}
        >{state === 'connecting' ? 'connecting…' : 'connect'}</button>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}
          title="attach to a tmux/screen session in the guest — survives disconnects and reloads">
          <input type="checkbox" checked={persist} onChange={(e) => setPersist(e.target.checked)} />
          persistent session
        </label>
        <span className="muted">{state}{err ? ` — ${err}` : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={boxRef} className="termwrap" />
        {state !== 'open' && (
          <div className="termhint">
            {state === 'connecting'
              ? <span className="busybtn"><ThinkingOrb state="connecting" size={20} theme="dark" aria-label="connecting" />connecting…</span>
              : state === 'error'
                ? <span style={{ color: 'var(--danger)' }}>{err || 'error'}</span>
                : state === 'closed'
                  ? 'connection lost — reconnecting…'
                  : 'starting shell…'}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ console (RFB)

function Console({ instanceId }: { instanceId: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<{ disconnect: () => void } | null>(null);
  const aliveRef = useRef(true);
  const userClosedRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<WsState>('idle');
  const [err, setErr] = useState('');

  const connect = async () => {
    if (!aliveRef.current || userClosedRef.current) return;
    setState('connecting');
    setErr('');
    try {
      // The package's "exports" map only exposes its root, so a deep path
      // (@novnc/novnc/core/rfb.js) fails to resolve under Turbopack. Import the
      // bare specifier instead.
      const { default: RFB } = await import('@novnc/novnc');
      const tok = await (await fetch(`/api/instances/${instanceId}/ws-token`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'vnc' }),
      })).json();
      if (!tok?.token) throw new Error(tok?.error ?? 'could not get a console token');
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${location.host}/api/instances/${instanceId}/console?token=${tok.token}`;
      const box = boxRef.current;
      if (!box) return;
      // QEMU runs VNC password=on; without credentials noVNC waits at the
      // auth stage forever (the 'connecting…' hang). The ws-token route
      // returns vncPass for console tokens, already owner/admin-gated.
      const rfb = new RFB(box, wsUrl, tok.vncPass ? { credentials: { password: tok.vncPass } } : {});
      rfb.scaleViewport = true;
      // An idle VNC session is silent too, so it is reaped by the same proxy
      // rule as the terminal. Retry unless the user asked for the disconnect.
      rfb.addEventListener('disconnect', () => {
        setState('closed');
        if (!aliveRef.current || userClosedRef.current) return;
        const delay = Math.min(1000 * 2 ** triesRef.current, 10_000);
        triesRef.current = Math.min(triesRef.current + 1, 4);
        if (retryRef.current) return;
        retryRef.current = setTimeout(() => {
          retryRef.current = null;
          void connectRef.current?.();
        }, delay);
      });
      rfb.addEventListener('connect', () => { triesRef.current = 0; setState('open'); });
      rfbRef.current = rfb as unknown as { disconnect: () => void };
    } catch (e) {
      setErr(String((e as Error).message));
      setState('error');
    }
  };
  connectRef.current = connect;

  useEffect(() => {
    aliveRef.current = true;
    userClosedRef.current = false;
    void connect();
    const onWake = () => {
      if (document.visibilityState === 'hidden' || userClosedRef.current) return;
      const r = rfbRef.current;
      if (r) return;
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      triesRef.current = 0;
      void connectRef.current?.();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', onWake);
    return () => {
      aliveRef.current = false;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', onWake);
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      rfbRef.current?.disconnect();
      rfbRef.current = null;
    };
  }, [instanceId]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button onClick={() => { userClosedRef.current = false; void connect(); }} disabled={state === 'connecting' || state === 'open'}>connect</button>
        <button onClick={() => { userClosedRef.current = true; rfbRef.current?.disconnect(); rfbRef.current = null; setState('closed'); }} disabled={state !== 'open'}>disconnect</button>
        <span className="muted">{state}{err ? ` — ${err}` : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={boxRef} className="consolwrap" />
        {state !== 'open' && (
          <div className="termhint">
            {state === 'connecting'
              ? <span className="busybtn"><ThinkingOrb state="connecting" size={20} theme="dark" aria-label="connecting" />connecting…</span>
              : state === 'error'
                ? <span style={{ color: 'var(--danger)' }}>{err || 'error'}</span>
                : state === 'closed'
                  ? 'connection lost — reconnecting…'
                  : 'starting console…'}
          </div>
        )}
      </div>
    </div>
  );
}
