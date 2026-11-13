/**
 * VNC console tab: noVNC over the instance console websocket.
 *
 * QEMU runs VNC password=on; the ws-token route returns vncPass for console
 * tokens (owner/admin-gated), which is passed as RFB credentials so noVNC
 * does not hang at the auth stage.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ThinkingOrb } from 'thinking-orbs';
import type { WsState } from './types';

type RfbLike = { disconnect: () => void; scaleViewport: boolean };

/** Mint the short-lived ws token for this instance's VNC console. */
async function fetchVncToken(instanceId: string): Promise<{ token: string; vncPass?: string }> {
  const res = await fetch(`/api/instances/${instanceId}/ws-token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'vnc' }),
  });
  const tok = await res.json();
  if (!tok?.token) throw new Error(tok?.error ?? 'could not get a console token');
  return tok as { token: string; vncPass?: string };
}

/** Open the noVNC session and wire its lifecycle events. */
async function openRfb(
  box: HTMLDivElement,
  wsUrl: string,
  vncPass: string | undefined,
  cbs: {
    onDisconnect: () => void;
    onConnect: () => void;
  },
): Promise<RfbLike> {
  // The package's "exports" map only exposes its root, so a deep path
  // (@novnc/novnc/core/rfb.js) fails to resolve under Turbopack. Import the
  // bare specifier instead.
  const { default: RFB } = await import('@novnc/novnc');
  const rfb = new RFB(box, wsUrl, vncPass ? { credentials: { password: vncPass } } : {});
  rfb.scaleViewport = true;
  rfb.addEventListener('disconnect', cbs.onDisconnect);
  rfb.addEventListener('connect', cbs.onConnect);
  return rfb as unknown as RfbLike;
}

/** Backoff reconnect shared by the disconnect listener and the wake handler. */
function scheduleRfbReconnect(
  aliveRef: React.RefObject<boolean>,
  userClosedRef: React.RefObject<boolean>,
  retryRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  triesRef: React.RefObject<number>,
  connectRef: React.RefObject<(() => Promise<void>) | null>,
  setState: (s: WsState) => void,
) {
  if (!aliveRef.current || userClosedRef.current) return;
  setState('closed');
  const delay = Math.min(1000 * 2 ** triesRef.current, 10_000);
  triesRef.current = Math.min(triesRef.current + 1, 4);
  if (retryRef.current) return;
  retryRef.current = setTimeout(() => {
    retryRef.current = null;
    void connectRef.current?.();
  }, delay);
}

export function Console({ instanceId }: { instanceId: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<RfbLike | null>(null);
  const aliveRef = useRef(true);
  const userClosedRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<WsState>('idle');
  const [err, setErr] = useState('');

  const connect = useCallback(async () => {
    if (!aliveRef.current || userClosedRef.current) return;
    setState('connecting');
    setErr('');
    try {
      const tok = await fetchVncToken(instanceId);
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${location.host}/api/instances/${instanceId}/console?token=${tok.token}`;
      const box = boxRef.current;
      if (!box) return;
      // An idle VNC session is silent too, so it is reaped by the same proxy
      // rule as the terminal. Retry unless the user asked for the disconnect.
      const rfb = await openRfb(box, wsUrl, tok.vncPass, {
        onDisconnect: () => scheduleRfbReconnect(aliveRef, userClosedRef, retryRef, triesRef, connectRef, setState),
        onConnect: () => { triesRef.current = 0; setState('open'); },
      });
      rfbRef.current = rfb;
    } catch (e) {
      setErr(String((e as Error).message));
      setState('error');
    }
  }, [instanceId]);
  // The retry timer and the wake handlers outlive the render that scheduled
  // them, so they call the latest connect through a ref.
  useEffect(() => { connectRef.current = connect; });

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
  }, [connect]);

  const disconnect = () => {
    userClosedRef.current = true;
    rfbRef.current?.disconnect();
    rfbRef.current = null;
    setState('closed');
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button onClick={() => { userClosedRef.current = false; void connect(); }} disabled={state === 'connecting' || state === 'open'}>connect</button>
        <button onClick={disconnect} disabled={state !== 'open'}>disconnect</button>
        <span className="muted">{state}{err ? ` — ${err}` : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={boxRef} className="consolwrap" />
        {state !== 'open' && <ConsoleHint state={state} err={err} />}
      </div>
    </div>
  );
}

function ConsoleHint({ state, err }: { state: WsState; err: string }) {
  if (state === 'connecting') {
    return <div className="termhint"><span className="busybtn"><ThinkingOrb state="connecting" size={20} theme="dark" aria-label="connecting" />connecting…</span></div>;
  }
  if (state === 'error') {
    return <div className="termhint"><span style={{ color: 'var(--danger)' }}>{err || 'error'}</span></div>;
  }
  return <div className="termhint">{state === 'closed' ? 'connection lost — reconnecting…' : 'starting console…'}</div>;
}
