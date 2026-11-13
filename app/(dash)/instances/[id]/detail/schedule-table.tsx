/**
 * The schedules table: active first, then a short tail of settled rows.
 */
'use client';

import { relTime } from '@/app/ui/time';

export type Schedule = {
  id: string; action: string; status: string;
  run_at: number | null; daily_time: string | null; weekly_dow: number | null;
  next_run: number; last_run: number | null; last_error: string | null;
  created_at: number;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function describe(schedule: Schedule): string {
  if (schedule.status !== 'active') return `${schedule.action} · ${schedule.status}`;
  if (schedule.daily_time) {
    const base = schedule.weekly_dow !== null ? `${DOW[schedule.weekly_dow]}s ` : 'daily ';
    return `${schedule.action} · ${base}${schedule.daily_time}`;
  }
  return `${schedule.action} · once`;
}

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  const cls = status === 'active' ? 'running' : status === 'failed' ? 'error' : 'stopped';
  return <span className={`badge ${cls}`}>{status}</span>;
}

function ScheduleRow({ schedule, onCancel }: { schedule: Schedule; onCancel: (id: string) => void }) {
  const active = schedule.status === 'active';
  return (
    <tr>
      <td>{describe(schedule)}</td>
      <td title={new Date(schedule.next_run).toLocaleString()}>{active ? when(schedule.next_run) : '—'}</td>
      <td>{statusBadge(schedule.status)}</td>
      <td className="copy">{schedule.last_error || '—'}</td>
      <td>{active && <button onClick={() => onCancel(schedule.id)} style={{ fontSize: 12 }}>cancel</button>}</td>
    </tr>
  );
}

export function ScheduleTable({ schedules, onCancel }: { schedules: Schedule[]; onCancel: (id: string) => void }) {
  const active = schedules.filter((s) => s.status === 'active');
  const past = schedules.filter((s) => s.status !== 'active').slice(0, 10);
  const rows = [...active, ...past];
  const lastRun = schedules.reduce((max, s) => Math.max(max, s.last_run ?? 0), 0);

  return (
    <>
      <table>
        <thead><tr><th>schedule</th><th>next</th><th>status</th><th>last error</th><th /></tr></thead>
        <tbody>
          {rows.map((schedule) => (
            <ScheduleRow key={schedule.id} schedule={schedule} onCancel={onCancel} />
          ))}
        </tbody>
      </table>
      {lastRun > 0 && (
        <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>last run {relTime(lastRun)}</div>
      )}
    </>
  );
}
