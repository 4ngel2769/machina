/** Fixed top-right toast stack. `toast.ok|err|info(msg)`; errors linger longer. */

'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

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
    setToasts((list) => [...list.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), kind === 'err' ? 6000 : 4000);
  }, []);

  const ctx = useMemo<Ctx>(() => ({
    ok: (message) => push('ok', message),
    err: (message) => push('err', message),
    info: (message) => push('info', message),
  }), [push]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div className="toaststack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <span className="toastdot" aria-hidden />
            <span>{toast.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
