'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/** Fixed top-right toast stack. `toast.ok|err|info(msg)`; errors linger longer. */

export type Toast = { id: number; kind: 'ok' | 'err' | 'info'; msg: string };
type Ctx = { ok: (m: string) => void; err: (m: string) => void; info: (m: string) => void };

const ToastCtx = createContext<Ctx>({ ok: () => {}, err: () => {}, info: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast['kind'], msg: string) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), kind === 'err' ? 6000 : 4000);
  }, []);

  const ctx = useMemo<Ctx>(() => ({
    ok: (m) => push('ok', m),
    err: (m) => push('err', m),
    info: (m) => push('info', m),
  }), [push]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="toaststack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span className="toastdot" aria-hidden />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
