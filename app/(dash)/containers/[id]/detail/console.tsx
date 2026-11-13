/**
 * Container console tab: `docker exec -it <ref> sh` over the container WS,
 * rendered in xterm. Shares lib/term-socket with the VM terminal — same wire
 * protocol, same reconnect/backoff/wake behaviour.
 */
'use client';

import { ThinkingOrb } from 'thinking-orbs';
import { useTermSocket, type WsState } from '@/lib/term-socket';
import { useCallback } from 'react';

async function mintExecToken(id: string): Promise<string> {
  const response = await fetch(`/api/containers/${encodeURIComponent(id)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: 'exec' }),
  });
  const body = await response.json().catch(() => ({}));
  if (!body?.token) throw new Error(body?.error ?? 'could not get a console token');
  return body.token as string;
}

export function ContainerConsole({ id }: { id: string }) {
  const socket = useTermSocket({
    mintToken: useCallback(() => mintExecToken(id), [id]),
    buildUrl: useCallback((token: string, cols: number, rows: number) =>
      `/api/containers/${encodeURIComponent(id)}/exec?token=${token}&cols=${cols}&rows=${rows}`,
    [id]),
  });
  const { boxRef, state, err, connect } = socket;

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button
          onClick={() => void connect()}
          disabled={state === 'connecting' || state === 'open'}
        >{state === 'connecting' ? 'connecting…' : 'connect'}</button>
        <span className="muted">{state}{err ? ` — ${err}` : ''}</span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
          docker exec · shell inside the container
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={boxRef} className="termwrap" />
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
  return <div className="termhint">{state === 'closed' ? 'connection lost — reconnecting…' : 'starting shell…'}</div>;
}
