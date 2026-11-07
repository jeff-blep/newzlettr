import fs from "node:fs";
import os from "node:os";
import { Router } from "express";
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

  r.get("/tasks", (_req, res) => res.json(listTasks()));
  r.post("/tasks/:id/run", async (req, res) => {
    const t = await runTask(req.params.id);
    if (!t) return res.status(404).json({ error: "no such task" });
    res.json(t);
  });

  return r;
}
