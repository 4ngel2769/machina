/**
 * Terminal socket plumbing for the instance detail page. The generic
 * xterm/WS lifecycle lives in @/lib/term-socket; this file only binds the
 * instance terminal's token endpoint and URL shape, plus the persist toggle.
 */
'use client';

import { useCallback, useState } from 'react';
import { useTermSocket } from '@/lib/term-socket';

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

/** Everything the Terminal component needs, in one hook. */
export function useTerminal(instanceId: string) {
  const [persist, setPersist] = useState(true);

  const socket = useTermSocket({
    mintToken: useCallback(() => mintToken(instanceId), [instanceId]),
    buildUrl: useCallback((token: string, cols: number, rows: number) =>
      `/api/instances/${instanceId}/terminal?token=${token}&persist=${persist ? 1 : 0}&cols=${cols}&rows=${rows}`,
    [instanceId, persist]),
  });

  return { ...socket, persist, setPersist };
}
