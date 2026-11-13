/**
 * Shared xterm + websocket plumbing: socket lifecycle, reconnect backoff,
 * wake/resize repair. Used by the instance terminal and the container exec
 * console — anything that speaks the {t:i|r|c} / binary-stdout wire protocol
 * against a token-minted endpoint.
 *
 * Every mutable slot is a real useRef() object passed by the caller; helpers
 * receive the ref objects themselves (names ending in Ref) so the compiler
 * lint treats .current writes as ref writes, not prop mutation.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

type Term = import('@xterm/xterm').Terminal;
type Fit = import('@xterm/addon-fit').FitAddon;

export type TermSocketOptions = {
  /** Mint the short-lived ws token; called on every (re)connect. */
  mintToken: () => Promise<string>;
  /** Path + query (no host/protocol) built after the token resolves. */
  buildUrl: (token: string, cols: number, rows: number) => string;
};

type SocketRefs = {
  connRef: React.MutableRefObject<WebSocket | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  boxRef: React.MutableRefObject<HTMLDivElement | null>;
  termRef: React.MutableRefObject<Term | null>;
  fitRef: React.MutableRefObject<Fit | null>;
  sizePushRef: React.MutableRefObject<(() => void) | null>;
};

type LifecycleRefs = SocketRefs & {
  aliveRef: React.MutableRefObject<boolean>;
  retryRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  triesRef: React.MutableRefObject<number>;
  connectRef: React.MutableRefObject<(() => Promise<void>) | null>;
  optionsRef: React.MutableRefObject<TermSocketOptions | null>;
};

/**
 * Reconnect on an unexpected close. The server heartbeat stops the routine
 * case (proxy idle reaping), but a dropped tunnel, a NAT rebind or a slept
 * laptop still disconnects, and previously that left a dead terminal until
 * the user navigated away. Backoff caps at 10s so it cannot hammer the
 * origin if the backend itself is gone.
 */
function useReconnect(
  aliveRef: LifecycleRefs['aliveRef'],
  retryRef: LifecycleRefs['retryRef'],
  triesRef: LifecycleRefs['triesRef'],
  connectRef: LifecycleRefs['connectRef'],
  termRef: LifecycleRefs['termRef'],
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
  socket: WebSocket,
  refs: SocketRefs & { triesRef: LifecycleRefs['triesRef'] },
  callbacks: { setState: (s: WsState) => void; setErr: (e: string) => void; onClose: () => void },
) {
  const { connRef, wsRef, boxRef, termRef, fitRef, sizePushRef, triesRef } = refs;
  const { setState, setErr, onClose } = callbacks;

  socket.onopen = () => {
    const box = boxRef.current;
    if (!box) return;
    const term = termRef.current;
    if (term && !term.element?.parentElement) { box.innerHTML = ''; term.open(box); }
    try { fitRef.current?.fit(); } catch { /* not laid out */ }
    requestAnimationFrame(() => { try { fitRef.current?.fit(); } catch { /* retry on next trigger */ } });
    sizePushRef.current?.();
    triesRef.current = 0;
    setState('open');
    setErr('');
    term?.write('\r\n\x1b[2m— connected\x1b[0m\r\n');
  };
  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) { termRef.current?.write(new Uint8Array(event.data)); return; }
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as { t: string; d?: string };
        if (message.t === 'e') setErr(message.d ?? 'stream error');
      } catch { /* ignore */ }
    }
  };
  socket.onclose = () => {
    if (connRef.current === socket) connRef.current = null;
    if (wsRef.current === socket) wsRef.current = null;
    onClose();
  };
  socket.onerror = () => { setErr('websocket error'); };
}

/** Build the xterm instance once; handlers bind against wsRef, never per socket. */
function useEnsureTerm(refs: SocketRefs) {
  const { wsRef, termRef, fitRef, sizePushRef } = refs;
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

/** Wake/resize listeners: repair a dropped socket the moment the tab is usable again. */
function useWake(
  connect: () => Promise<void>,
  refs: LifecycleRefs,
) {
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
      const socket = connRef.current;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
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

/** All the refs the socket lifecycle needs, allocated once per mount. */
function useSocketRefs(): LifecycleRefs {
  const connRef = useRef<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Term | null>(null);
  const fitRef = useRef<Fit | null>(null);
  const sizePushRef = useRef<(() => void) | null>(null);
  const aliveRef = useRef(true);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triesRef = useRef(0);
  const connectRef = useRef<(() => Promise<void>) | null>(null);
  const optionsRef = useRef<TermSocketOptions | null>(null);
  return { connRef, wsRef, boxRef, termRef, fitRef, sizePushRef, aliveRef, retryRef, triesRef, connectRef, optionsRef };
}

/** Everything a terminal-style component needs, in one hook. */
export function useTermSocket(options: TermSocketOptions) {
  const refs = useSocketRefs();
  const { connRef, wsRef, boxRef, fitRef, optionsRef, connectRef } = refs;
  useEffect(() => { optionsRef.current = options; });

  const [state, setState] = useState<WsState>('idle');
  const [err, setErr] = useState('');

  const scheduleReconnect = useReconnect(refs.aliveRef, refs.retryRef, refs.triesRef, refs.connectRef, refs.termRef, setState);
  const ensureTerm = useEnsureTerm(refs);

  const connect = useCallback(async () => {
    if (connRef.current || !refs.aliveRef.current) return;
    setState('connecting');
    setErr('');
    try {
      const term = await ensureTerm();
      const token = await optionsRef.current!.mintToken();
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      try { fitRef.current?.fit(); } catch { /* not laid out */ }
      const cols = term.cols || 80;
      const rows = term.rows || 24;
      const socket = new WebSocket(`${protocol}://${location.host}${optionsRef.current!.buildUrl(token, cols, rows)}`);
      socket.binaryType = 'arraybuffer';
      connRef.current = socket;
      wsRef.current = socket;
      wireSocket(socket, refs, { setState, setErr, onClose: scheduleReconnect });
    } catch (event) {
      setErr(String((event as Error).message));
      connRef.current = null;
      scheduleReconnect();
    }
  }, [scheduleReconnect, ensureTerm]);

  useEffect(() => { connectRef.current = connect; });
  useWake(connect, refs);

  return { boxRef, state, err, connect };
}
