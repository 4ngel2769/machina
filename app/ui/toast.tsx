/**
 * Toast layer. Two systems, deliberately:
 *
 * - sileo renders the ordinary ok/err/info notifications, top-center, with
 *   its gooey spring morph. `useToast().ok|err|info(msg)` keeps working for
 *   every existing call site.
 * - sonner stays mounted bottom-right ONLY for the persistent, toggleable
 *   job-progress toasts in job-toasts.tsx — those are a different object
 *   (sticky, compactable, linked) and sileo has no equivalent.
 */
'use client';

import { createContext, useContext, useMemo } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { Toaster as SileoToaster, sileo } from 'sileo';
import 'sileo/styles.css';

type Ctx = { ok: (m: string) => void; err: (m: string) => void; info: (m: string) => void };

const ToastCtx = createContext<Ctx>({ ok: () => {}, err: () => {}, info: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const SILEO_OPTS = {
  fill: 'var(--surface-2)',
  roundness: 12,
  duration: 5000,
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const ctx = useMemo<Ctx>(() => ({
    ok: (message) => { sileo.success({ title: message, ...SILEO_OPTS }); },
    err: (message) => { sileo.error({ title: message, ...SILEO_OPTS, duration: 8000 }); },
    info: (message) => { sileo.info({ title: message, ...SILEO_OPTS }); },
  }), []);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <SileoToaster position="top-center" theme="dark" offset={12} />
      <SonnerToaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'inherit' } }}
      />
    </ToastCtx.Provider>
  );
}
