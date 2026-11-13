/**
 * Job-log parsing for the instance detail page: raw worker text becomes the
 * friendly, animated lines the UI renders while a job runs.
 */

import { rawDb } from '@/lib/db';
import { friendlyStep } from '@/lib/core/errors';

export type LogLine = { t: number; m: string; kind: 'step' | 'ok' | 'err' | 'info' };

function friendlyStepLine(text: string): string {
  const step = friendlyStep(text);
  return step === 'working' ? text.replace(/\.$/, '') : step;
}

function stepKind(text: string): 'step' | 'ok' | 'err' | 'info' {
  if (/running|started|done|ok|created|reserved|registered/i.test(text)) return 'ok';
  if (/waiting|cleaning|settling|writing/i.test(text)) return 'info';
  if (/delete|destroy|remov/i.test(text)) return 'err';
  return 'step';
}

/** One "[ts] text" row -> a LogLine, or null when it carries nothing new. */
function parseLogLine(rawLine: string, seen: Set<number>): LogLine | null {
  const match = rawLine.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return null;
  const timestamp = Date.parse(match[1]);
  const text = match[2].trim();
  if (!text || seen.has(timestamp)) return null;
  seen.add(timestamp);
  if (/^FAILED:/.test(text)) return null; // rendered separately as the error
  return { t: timestamp, m: friendlyStepLine(text), kind: stepKind(text) };
}

/** Parse a job log into friendly, animated lines for the UI. Raw text stays in
 *  the DB; this is what a person actually wants to read while waiting. */
export function logJobLines(jobId?: string): LogLine[] {
  if (!jobId) return [];
  const row = rawDb().prepare(`select log, status, error, finished_at, started_at, created_at from jobs where id=?`).get(jobId) as
    | { log: string; status: string; error: string; finished_at: number | null; started_at: number | null; created_at: number } | undefined;
  if (!row) return [];
  const out: LogLine[] = [];
  const seen = new Set<number>();
  for (const rawLine of String(row.log ?? '').split('\n')) {
    const line = parseLogLine(rawLine, seen);
    if (line) out.push(line);
  }
  // The terminal line carries the job's REAL end time. Date.now() here was
  // wrong: it stamped the failure with whenever the page was next opened,
  // which made a 2-minute failure look like a 10-hour hang.
  out.push(...terminalLines(row));
  return out.slice(-40);
}

function terminalLines(row: { status: string; error: string; finished_at: number | null; started_at: number | null; created_at: number }) {
  const endT = row.finished_at ?? row.started_at ?? row.created_at;
  const lines: LogLine[] = [];
  if (row.status === 'done') lines.push({ t: endT, m: 'finished successfully', kind: 'ok' });
  if (row.status === 'failed' && row.error) lines.push({ t: endT, m: row.error, kind: 'err' });
  return lines;
}
