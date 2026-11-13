/**
 * Web terminal tab: xterm.js over the instance terminal websocket.
 *
 * One xterm instance lives for the mount; reconnects swap only the socket so
 * scrollback survives a drop. The reconnect/backoff/wake logic lives in
 * ./use.ts so this file stays a thin shell.
 */
'use client';

import { ThinkingOrb } from 'thinking-orbs';
import { useTerminal } from './term-use';
import type { WsState } from './types';

export function Terminal({ instanceId }: { instanceId: string }) {
  const { boxRef, state, err, persist, setPersist, connect } = useTerminal(instanceId);

  return (
    <div>
      <div className="row" style={{ marginBottom: 6 }}>
        <button
          onClick={() => void connect()}
          disabled={state === 'connecting' || state === 'open'}
        >{state === 'connecting' ? 'connecting…' : 'connect'}</button>
        <label className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}
          title="attach to a tmux/screen session in the guest — survives disconnects and reloads">
          <input type="checkbox" checked={persist} onChange={(event) => setPersist(event.target.checked)} />
          persistent session
        </label>
        <span className="muted">{state}{err ? ` — ${err}` : ''}</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={boxRef} className="termwrap" />
        {state !== 'open' && <TermHint state={state} err={err} />}
      </div>
    </div>
  );
}

function TermHint({ state, err }: { state: WsState; err: string }) {
  if (state === 'connecting') {
    return <div className="termhint"><span className="busybtn"><ThinkingOrb state="connecting" size={20} theme="dark" aria-label="connecting" />connecting…</span></div>;
  }
  if (state === 'error') {
    return <div className="termhint"><span style={{ color: 'var(--danger)' }}>{err || 'error'}</span></div>;
  }
  return <div className="termhint">{state === 'closed' ? 'connection lost — reconnecting…' : 'starting shell…'}</div>;
}
