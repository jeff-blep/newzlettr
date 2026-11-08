import fs from "node:fs";
import os from "node:os";
import express, { Router } from "express";
import { backupPath, createBackup, listBackups, RESTORE_FILE, validateBackupFile } from "../backup.js";
import { importV1, type V1Files } from "../importer/v1.js";
import { logger } from "../logging.js";
import { type LogEntry, readLogs } from "../logs.js";
import pkg from "../../../package.json" with { type: "json" };
import type { SystemStatus } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { CONFIG_DIR, DB_FILE, LOG_FILE } from "../paths.js";
import { effectiveTimezone } from "../settings.js";
import { lastHealth, runHealthChecks } from "../health.js";
import { listTasks, runTask } from "../tasks.js";

const startedAt = new Date();
export const VERSION = pkg.version;

export function systemRouter(db: DB): Router {
  const r = Router();
  const log = logger("system");

  r.get("/status", (_req, res) => {
    let dbSize = 0;
    for (const f of [DB_FILE, `${DB_FILE}-wal`]) {
      try {
        dbSize += fs.statSync(f).size;
      } catch {
        /* missing wal is fine */
      }
    }
    const body: SystemStatus = {
      version: VERSION,
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      arch: process.arch,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      configDir: CONFIG_DIR,
      databaseFile: DB_FILE,
      databaseSizeBytes: dbSize,
      logFile: LOG_FILE,
      timezone: effectiveTimezone(db),
      runningInDocker: fs.existsSync("/.dockerenv"),
    };
    res.json(body);
  });

  r.get("/health", (_req, res) => res.json(lastHealth()));
  r.post("/health", async (_req, res) => res.json(await runHealthChecks(db)));

  /* ---------------------------------- logs ---------------------------------- */

  r.get("/logs", (req, res) => {
    const level = ["trace", "debug", "info", "warn", "error"].includes(String(req.query.level)) ? (String(req.query.level) as LogEntry["level"]) : "info";
    res.json(readLogs({ minLevel: level, q: typeof req.query.q === "string" ? req.query.q : undefined, limit: Math.min(2000, Number(req.query.limit) || 500) }));
  });
  r.get("/logs/download", (_req, res) => res.download(LOG_FILE, "newzlettr.txt"));

  /* --------------------------------- backups -------------------------------- */

  r.get("/backups", (_req, res) => res.json({ backups: listBackups(), restorePending: fs.existsSync(RESTORE_FILE) }));
  r.post("/backups", (_req, res) => res.status(201).json(createBackup(db, "manual")));
  r.get("/backups/:name", (req, res) => {
    const p = backupPath(req.params.name);
    if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "not found" });
    res.download(p, req.params.name);
  });
  r.delete("/backups/:name", (req, res) => {
    const p = backupPath(req.params.name);
    if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "not found" });
    fs.rmSync(p);
    res.status(204).end();
  });

  /** Stage a restore from an uploaded backup; applied on next restart. */
  r.post("/restore", express.raw({ type: "application/octet-stream", limit: "200mb" }), (req, res) => {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 512) return res.status(400).json({ error: "Upload a Newzlettr backup (.db) file" });
    const tmp = `${RESTORE_FILE}.upload`;
    fs.writeFileSync(tmp, body);
    const problem = validateBackupFile(tmp);
    if (problem) {
      fs.rmSync(tmp, { force: true });
      return res.status(400).json({ error: problem });
    }
    fs.renameSync(tmp, RESTORE_FILE);
    log.warn("restore staged; will apply on next restart");
    res.json({ ok: true, message: "Backup checked and staged. Restart Newzlettr (restart the container) to finish restoring." });
  });
  r.delete("/restore", (_req, res) => {
    fs.rmSync(RESTORE_FILE, { force: true });
    res.status(204).end();
  });

  /* ------------------------------- v1 import -------------------------------- */

  r.post("/import-v1", express.json({ limit: "20mb" }), (req, res) => {
    const b = req.body ?? {};
    const files: V1Files = { config: b.config, recipients: b.recipients, templates: b.templates, newsletters: b.newsletters };
    if (!Object.values(files).some((v) => v !== undefined)) return res.status(400).json({ error: "Choose at least one v1 file" });
    const summary = importV1(db, files);
    log.info({ ...summary, notes: summary.notes.length }, "v1 import");
    res.json(summary);
  });

  r.get("/tasks", (_req, res) => res.json(listTasks()));
  r.post("/tasks/:id/run", async (req, res) => {
    const t = await runTask(req.params.id);
    if (!t) return res.status(404).json({ error: "no such task" });
    res.json(t);
  });

  return r;
}
