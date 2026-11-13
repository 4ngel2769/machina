/**
 * Database creation and in-place migrations, kept in one ordered sequence.
 */
import { rawDb } from './index';
import { MIGRATIONS_1 } from './migrations';
import { MIGRATIONS_2 } from './migrations2';



export function initDb(): void {
  const db = rawDb();
  db.exec(`create table if not exists schema_migrations (version text primary key, applied_at integer not null)`);
  const applied = new Set(
    (db.prepare('select version from schema_migrations').all() as { version: string }[]).map((row) => row.version),
  );
  for (const migration of [...MIGRATIONS_1, ...MIGRATIONS_2]) {
    if (applied.has(migration.version)) continue;
    db.exec(migration.sql);
    db.prepare('insert into schema_migrations (version, applied_at) values (?, ?)').run(migration.version, Date.now());
  }
}
