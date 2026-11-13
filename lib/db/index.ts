/**
 * SQLite access layer (better-sqlite3 + drizzle). One raw handle per process;
 * getDb() returns the drizzle wrapper over it. Both auto-init because Next dev
 * bundles duplicate module copies: initDb() is IDEMPOTENT and safe everywhere.
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '@/lib/config';
import { initDb } from './initDb';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let rawHandle: Database.Database | null = null;
let drizzleHandle: ReturnType<typeof drizzle> | null = null;

/** WAL SQLite handle with pragmatic pragmas. */
export function rawDb(): Database.Database {
  if (rawHandle) return rawHandle;
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rawHandle = new Database(config.dbPath);
  rawHandle.pragma('journal_mode = WAL');
  rawHandle.pragma('busy_timeout = 10000');
  rawHandle.pragma('foreign_keys = ON');
  return rawHandle;
}

type AppDb = ReturnType<typeof drizzle>;
/** Drizzle relation handle. */
export function getDb(): AppDb {
  if (drizzleHandle) return drizzleHandle;
  drizzleHandle = drizzle(rawDb(), { schema });
  initDb();
  return drizzleHandle;
}

/** Idempotent DDL+migrations. Called on every access path and in worker boot. */
export function ensureDbReady(): void {
  initDb();
}

export { schema };
