/**
 * Terminal socket plumbing for the instance detail page: xterm lifecycle,
 * reconnect backoff and the wake/resize handlers.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsState } from './types';

type Term = import('@xterm/xterm').Terminal;
type Fit = import('@xterm/addon-fit').FitAddon;

/**
 * Reconnect on an unexpected close. The server heartbeat stops the routine
 * case (proxy idle reaping), but a dropped tunnel, a NAT rebind or a slept
 * laptop still disconnect, and previously that left a dead terminal until
 * the user navigated away. Backoff caps at 10s so it cannot hammer the
 * origin if the instance itself is gone.
 */
function useReconnect(
  aliveRef: React.RefObject<boolean>,
  retryRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  triesRef: React.RefObject<number>,
  connectRef: React.RefObject<(() => Promise<void>) | null>,
  termRef: React.RefObject<Term | null>,
  setState: (s: WsState) => void,
) {
  return useCallback(() => {
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
  }, [aliveRef, retryRef, triesRef, connectRef, termRef, setState]);
}

/** Wire one websocket's handlers; shared shape for connect(). */
function wireSocket(
  ws: WebSocket,
  refs: {
    connRef: React.RefObject<WebSocket | null>;
    wsRef: React.RefObject<WebSocket | null>;
    boxRef: React.RefObject<HTMLDivElement | null>;
    termRef: React.RefObject<Term | null>;
    fitRef: React.RefObject<Fit | null>;
    sizePushRef: React.RefObject<(() => void) | null>;
  },
  callbacks: {
    setState: (s: WsState) => void;
    setErr: (e: string) => void;
    onClose: () => void;
  },
) {
  const { connRef, wsRef, boxRef, termRef, fitRef, sizePushRef } = refs;
  const { setState, setErr, onClose } = callbacks;

  ws.onopen = () => {
    const box = boxRef.current;
    if (!box) return;
    const term = termRef.current;
    if (term && !term.element?.parentElement) { box.innerHTML = ''; term.open(box); }
    try { fitRef.current?.fit(); } catch { /* not laid out */ }
    requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch { /* retry on next trigger */ } });
    sizePushRef.current?.();
    setState('open');
    setErr('');
    // A shell is a new session, not the old one resumed. Say so, or the
    // user types into a prompt that no longer has their history.
    term?.write('\r\n\x1b[2m— connected\x1b[0m\r\n');
  };
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) { termRef.current?.write(new Uint8Array(event.data)); return; }
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as { t: string; d?: string };
        if (message.t === 'e') setErr(message.d ?? 'terminal error');
      } catch { /* ignore */ }
    }
  };
  ws.onclose = () => {
    if (connRef.current === ws) connRef.current = null;
    if (wsRef.current === ws) wsRef.current = null;
    onClose();
  };
  ws.onerror = () => { setErr('websocket error'); };
}

/** Mint the short-lived ws token for this instance's terminal. */
async function mintToken(instanceId: string): Promise<string> {
  const response = await fetch(`/api/instances/${instanceId}/ws-token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'term' }),
  });
  const tokenBody = await response.json();
  if (!tokenBody?.token) throw new Error(tokenBody?.error ?? 'could not get a terminal token');
  return tokenBody.token as string;
}

/** Build the xterm instance once; handlers bind against wsRef, never per socket. */
function useEnsureTerm(
  wsRef: React.RefObject<WebSocket | null>,
  termRef: React.RefObject<Term | null>,
  fitRef: React.RefObject<Fit | null>,
  sizePushRef: React.RefObject<(() => void) | null>,
) {
  return useCallback(async () => {
    if (termRef.current) return termRef.current;
    const [{ Terminal }, { FitAddon }] = await Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/xterm/css/xterm.css'),
    ]);
    const term = new Terminal({
      cursorBlink: true, fontFamily: '"JetBrains Mono", monospace', fontSize: 13,
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;
    fitRef.current = fitAddon;
    term.onData((inputData) => {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'i', d: btoa(unescape(encodeURIComponent(inputData))) }));
      }
    });
    const pushSize = () => {
      const socket = wsRef.current;
      const terminal = termRef.current;
      if (socket && socket.readyState === WebSocket.OPEN && terminal && terminal.element) {
        socket.send(JSON.stringify({ t: 'r', c: terminal.cols, r: terminal.rows }));
      }
    };
    term.onResize(() => pushSize());
    sizePushRef.current = pushSize;
    return term;
  }, [wsRef, termRef, fitRef, sizePushRef]);
}

type WakeRefs = {
  connRef: React.RefObject<WebSocket | null>;
  wsRef: React.RefObject<WebSocket | null>;
  termRef: React.RefObject<Term | null>;
  fitRef: React.RefObject<Fit | null>;
  sizePushRef: React.RefObject<(() => void) | null>;
  aliveRef: React.RefObject<boolean>;
  retryRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  triesRef: React.RefObject<number>;
};

/** Wake/resize listeners: repair a dropped socket the moment the tab is usable again. */
function useWake(connect: () => Promise<void>, refs: WakeRefs) {
  const { connRef, wsRef, termRef, fitRef, sizePushRef, aliveRef, retryRef, triesRef } = refs;
  useEffect(() => {
    aliveRef.current = true;
    void connect();
    const onResize = () => {
      try { fitRef.current?.fit(); } catch { /* hidden */ }
      sizePushRef.current?.();
    };
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      onResize();
      const conn = connRef.current;
      if (conn && (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING)) return;
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
      triesRef.current = 0;
      void connect();
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
}

/** Everything the Terminal component needs, in one hook. */
export function useTerminal(instanceId: string) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const connRef = useRef<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sizePushRef = useRef<(() => void) | null>(null);
  const termRef = useRef<Term | null>(null);
  const fitRef = useRef<Fit | null>(null);
  const aliveRef = useRef(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<WsState>('idle');
  const [err, setErr] = useState('');
  const [persist, setPersist] = useState(true);

  const scheduleReconnect = useReconnect(aliveRef, retryRef, triesRef, connectRef, termRef, setState);
  const ensureTerm = useEnsureTerm(wsRef, termRef, fitRef, sizePushRef);

  const connect = useCallback(async () => {
    if (connRef.current || !aliveRef.current) return;
    setState('connecting');
    setErr('');
    try {
      const term = await ensureTerm();
      const token = await mintToken(instanceId);
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      // Fit first when possible so the multiplexer spawns at the real grid
      // size; the 'r' push right after open corrects any drift anyway.
      try { fitRef.current?.fit(); } catch { /* not laid out */ }
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const socket = new WebSocket(`${protocol}://${location.host}/api/instances/${instanceId}/terminal?token=${token}&persist=${persist ? 1 : 0}&cols=${cols}&rows=${rows}`);
      socket.binaryType = 'arraybuffer'; // server streams stdout as binary frames
      connRef.current = socket;
      wsRef.current = socket;
      wireSocket(socket, { connRef, wsRef, boxRef, termRef, fitRef, sizePushRef }, {
        setState, setErr, onClose: scheduleReconnect,
      });
      // tries reset on open, inside wireSocket's onopen via triesRef — kept
      // here so the callback shape stays identical to the pre-split code.
      const prevOnOpen = socket.onopen;
      socket.onopen = (event) => { triesRef.current = 0; prevOnOpen?.call(socket, event); };
    } catch (event) {
      setErr(String((event as Error).message));
      connRef.current = null;
      scheduleReconnect();
    }
  }, [instanceId, persist, scheduleReconnect, ensureTerm]);

  // The retry timer and the wake handlers outlive the render that scheduled
  // them, so they call the latest connect through a ref.
  useEffect(() => { connectRef.current = connect; });
  useWake(connect, { connRef, wsRef, termRef, fitRef, sizePushRef, aliveRef, retryRef, triesRef });

  return { boxRef, state, err, persist, setPersist, connect };
}
