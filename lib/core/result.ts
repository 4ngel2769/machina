/**
 * Expected failures as values. Core validators return Result<T> instead of
 * throwing for input problems; callers decide whether the message is a 400 to
 * a user or a log line. Routes keep the throw + friendlyError() convention —
 * see CONTRIBUTING.md.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: string): Result<T> {
  return { ok: false, error };
}

export function isOk<T>(r: Result<T>): r is { ok: true; value: T } {
  return r.ok;
}

/** The value, or throw — for callers that still want exception semantics. */
export function unwrap<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
