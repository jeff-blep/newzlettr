import fs from "node:fs";
import { LOG_FILE } from "./paths.js";

export interface LogEntry {
  time: string;
  level: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
  component?: string;
  msg: string;
  extra?: Record<string, unknown>;
}

const LEVELS: Record<number, LogEntry["level"]> = { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" };
const RANK: Record<LogEntry["level"], number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const TAIL_BYTES = 2 * 1024 * 1024;

/** Newest-first entries from the current log file (last ~2 MB), filtered. */
export function readLogs(opts: { minLevel?: LogEntry["level"]; q?: string; limit?: number }): LogEntry[] {
  if (!fs.existsSync(LOG_FILE)) return [];
  const size = fs.statSync(LOG_FILE).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fd = fs.openSync(LOG_FILE, "r");
  const buf = Buffer.alloc(size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const lines = buf.toString("utf8").split("\n");
  if (start > 0) lines.shift(); // partial first line

  const min = RANK[opts.minLevel ?? "trace"];
  const q = opts.q?.toLowerCase().trim();
  const limit = opts.limit ?? 500;
  const out: LogEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const level = LEVELS[Number(raw.level)] ?? "info";
    if (RANK[level] < min) continue;
    if (q && !line.toLowerCase().includes(q)) continue;
    const { level: _l, time, msg, component, ...extra } = raw;
    out.push({
      time: typeof time === "number" ? new Date(time).toISOString() : String(time ?? ""),
      level,
      component: component as string | undefined,
      msg: String(msg ?? ""),
      extra: Object.keys(extra).length ? extra : undefined,
    });
  }
  return out;
}
