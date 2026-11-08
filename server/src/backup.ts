import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DB } from "./db/index.js";
import { MIGRATIONS } from "./db/migrations.js";
import { logger } from "./logging.js";
import { CONFIG_DIR, DB_FILE } from "./paths.js";

const log = logger("backup");
export const BACKUP_DIR = path.join(CONFIG_DIR, "backups");
export const RESTORE_FILE = path.join(CONFIG_DIR, "restore-pending.db");
const KEEP_SCHEDULED = 4;

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: "manual" | "scheduled";
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** Consistent snapshot of the live DB (safe while running; WAL-aware). */
export function createBackup(db: DB, kind: BackupInfo["kind"]): BackupInfo {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `newzlettr_${kind}_${stamp()}.db`;
  const file = path.join(BACKUP_DIR, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  if (kind === "scheduled") pruneScheduled();
  log.info({ name }, "backup created");
  return describe(name)!;
}

function pruneScheduled() {
  const old = listBackups()
    .filter((b) => b.kind === "scheduled")
    .slice(KEEP_SCHEDULED);
  for (const b of old) fs.rmSync(path.join(BACKUP_DIR, b.name), { force: true });
}

function describe(name: string): BackupInfo | null {
  if (!/^newzlettr_(manual|scheduled)_[\dT-]+\.db$/.test(name)) return null;
  const st = fs.statSync(path.join(BACKUP_DIR, name));
  return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString(), kind: name.includes("_scheduled_") ? "scheduled" : "manual" };
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .map(describe)
    .filter((b): b is BackupInfo => !!b)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolves a backup name to a path, refusing anything that isn't one of ours. */
export function backupPath(name: string): string | null {
  return describe(path.basename(name)) && path.basename(name) === name ? path.join(BACKUP_DIR, name) : null;
}

/** Checks an uploaded file really is a Newzlettr database before staging it. */
export function validateBackupFile(file: string): string | null {
  let d: DatabaseSync | null = null;
  try {
    d = new DatabaseSync(file, { readOnly: true });
    const v = (d.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (v < 1) return "That file isn't a Newzlettr backup (no schema version).";
    if (v > MIGRATIONS.at(-1)!.version) return "That backup is from a newer Newzlettr. Update first, then restore.";
    for (const t of ["settings", "users", "newsletters", "templates", "recipients"]) {
      if (!d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t)) return `That backup is missing the ${t} table.`;
    }
    const ok = (d.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
    return ok === "ok" ? null : `The backup is damaged: ${ok}`;
  } catch {
    return "That file isn't a SQLite database.";
  } finally {
    d?.close();
  }
}

/**
 * Called at startup before the DB opens: if a restore was staged, keep the current DB as a
 * safety copy and swap the restore in (*arr behaviour: restore applies on restart).
 */
export function applyPendingRestore(): string | null {
  if (!fs.existsSync(RESTORE_FILE)) return null;
  const safety = `${DB_FILE}.before-restore-${stamp()}`;
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, safety);
  for (const ext of ["-wal", "-shm"]) fs.rmSync(DB_FILE + ext, { force: true });
  fs.renameSync(RESTORE_FILE, DB_FILE);
  return safety;
}
