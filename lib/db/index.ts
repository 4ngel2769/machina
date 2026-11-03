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

let rawInst: Database.Database | null = null;
let drInst: ReturnType<typeof drizzle> | null = null;

/** WAL SQLite handle with pragmatic pragmas. */
export function rawDb(): Database.Database {
  if (rawInst) return rawInst;
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  rawInst = new Database(config.dbPath);
  rawInst.pragma('journal_mode = WAL');
  rawInst.pragma('busy_timeout = 10000');
  rawInst.pragma('foreign_keys = ON');
  return rawInst;
}

type AppDb = ReturnType<typeof drizzle>;
/** Drizzle relation handle. */
export function getDb(): AppDb {
  if (drInst) return drInst;
  drInst = drizzle(rawDb(), { schema });
  initDb();
  return drInst;
}

/** Idempotent DDL+migrations. Called on every access path and in worker boot. */
export function ensureDbReady(): void {
  initDb();
}

export { schema };
