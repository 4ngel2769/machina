/**
 * Scheduled operations panel for one instance: upcoming start/stop jobs.
 * Recurring schedules show their next fire; one-shots show their run time.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/app/ui/toast';
import { Empty, Skeleton } from '@/app/ui/loaders';
import { ScheduleTable, type Schedule } from './schedule-table';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The create form: action, frequency, time/day, optional one-shot datetime. */
function CreateForm({ instanceId, onCreated }: { instanceId: string; onCreated: () => void }) {
  const toast = useToast();
  const [action, setAction] = useState<'start' | 'stop'>('start');
  const [freq, setFreq] = useState<'once' | 'daily' | 'weekly'>('daily');
  const [time, setTime] = useState('08:00');
  const [dow, setDow] = useState('1');
  const [runAt, setRunAt] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const body: Record<string, unknown> = { instanceId, action, freq };
    if (freq === 'once') {
      if (!runAt) { toast.err('pick a date and time'); setBusy(false); return; }
      body.runAt = new Date(runAt).getTime();
    } else {
      body.time = time;
      if (freq === 'weekly') body.dow = Number(dow);
    }
    const response = await fetch('/api/schedules', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (response.ok) { toast.ok('schedule created'); onCreated(); }
    else toast.err(result.error ?? 'could not create the schedule');
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 }}>
      <div>
        <label htmlFor="sch-action">action</label>
        <select id="sch-action" value={action} onChange={(e) => setAction(e.target.value as 'start' | 'stop')}>
          <option value="start">start</option>
          <option value="stop">stop</option>
        </select>
      </div>
      <div>
        <label htmlFor="sch-freq">when</label>
        <select id="sch-freq" value={freq} onChange={(e) => setFreq(e.target.value as 'once' | 'daily' | 'weekly')}>
          <option value="once">once</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
      </div>
      {freq === 'once' ? (
        <div>
          <label htmlFor="sch-at">at</label>
          <input id="sch-at" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="sch-time">time</label>
            <input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {freq === 'weekly' && (
            <div>
              <label htmlFor="sch-dow">day</label>
              <select id="sch-dow" value={dow} onChange={(e) => setDow(e.target.value)}>
                {DOW.map((name, index) => <option key={name} value={index}>{name}</option>)}
              </select>
            </div>
          )}
        </>
      )}
      <button className="primary" disabled={busy} onClick={() => void submit()}>{busy ? 'saving…' : 'schedule'}</button>
    </div>
  );
}

export function SchedulePanel({ instanceId, instanceStatus }: { instanceId: string; instanceStatus: string }) {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const settled = instanceStatus === 'running' || instanceStatus === 'stopped';

  const load = useCallback(async () => {
    const response = await fetch(`/api/schedules?instanceId=${encodeURIComponent(instanceId)}`, { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json();
      setSchedules(body.schedules);
    } else toast.err('could not load schedules');
  }, [instanceId, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  const cancel = async (id: string) => {
    const response = await fetch('/api/schedules', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'cancel', id }),
    });
    if (response.ok) { toast.ok('schedule cancelled'); void load(); }
    else toast.err('cancel failed');
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>scheduled operations</h3>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        start or stop this VM at a set time. Runs go through the normal job queue, so a schedule that fires while another job is in flight queues behind it.
      </div>

      {settled ? (
        <CreateForm instanceId={instanceId} onCreated={() => void load()} />
      ) : (
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          scheduling is available once the instance is running or stopped.
        </div>
      )}

      {!schedules && <Skeleton h={80} />}
      {schedules && schedules.length === 0 && <Empty text="nothing scheduled" />}
      {schedules && schedules.length > 0 && <ScheduleTable schedules={schedules} onCancel={(id) => void cancel(id)} />}
    </div>
  );
}
