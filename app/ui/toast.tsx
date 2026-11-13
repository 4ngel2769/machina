/**
 * Toast layer backed by sonner. `useToast().ok|err|info(msg)` keeps working
 * for every existing call site; sonner renders them bottom-right, stacked,
 * with its own dismiss and duration handling. Job toasts use toast.custom.
 */
'use client';

import { createContext, useContext, useMemo } from 'react';
import { Toaster, toast as sonner } from 'sonner';

type Ctx = { ok: (m: string) => void; err: (m: string) => void; info: (m: string) => void };

const ToastCtx = createContext<Ctx>({ ok: () => {}, err: () => {}, info: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const ctx = useMemo<Ctx>(() => ({
    ok: (message) => { sonner.success(message); },
    err: (message) => { sonner.error(message, { duration: 8000 }); },
    info: (message) => { sonner.info(message); },
  }), []);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'inherit' } }}
      />
    </ToastCtx.Provider>
  );
}
