/**
 * Runtime settings: small JSON documents in the settings table, edited by
 * admins through the API. config.ts stays the source of defaults — a missing
 * row means "use the built-in value", so settings are overrides, not a
 * second config system.
 */
import { rawDb } from '@/lib/db';

export function getSetting<T>(key: string): T | null {
  const row = rawDb().prepare(`select value from settings where key=?`).get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export function setSetting(key: string, value: unknown): void {
  rawDb().prepare(
    `insert into settings (key, value) values (?, ?)
     on conflict(key) do update set value=excluded.value`,
  ).run(key, JSON.stringify(value));
}
