import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./migrations.js";

export type DB = DatabaseSync;

let db: DatabaseSync | null = null;

export function openDb(file: string): DatabaseSync {
  const d = new DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(d);
  db = d;
  return d;
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error("database not opened");
  return db;
}

/** Applies pending migrations in order; schema version lives in PRAGMA user_version. */
export function migrate(d: DatabaseSync): number {
  const row = d.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    d.exec("BEGIN");
    try {
      d.exec(m.sql);
      d.exec(`PRAGMA user_version = ${m.version}`);
      d.exec("COMMIT");
      version = m.version;
    } catch (e) {
      d.exec("ROLLBACK");
      throw new Error(`migration ${m.version} (${m.name}) failed: ${(e as Error).message}`);
    }
  }
  return version;
}

/** Runs fn inside a transaction (node:sqlite has no helper for this). */
export function tx<T>(d: DatabaseSync, fn: () => T): T {
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
