import fs from "node:fs";
import pino from "pino";
import { LOG_FILE } from "./paths.js";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const KEEP_ROTATED = 5;

/** Size-based rotation: newzlettr.txt -> .0.txt ... (oldest dropped). Called at startup and by a task. */
export function rotateLogsIfNeeded(file = LOG_FILE): boolean {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < MAX_LOG_BYTES) return false;
    const base = file.replace(/\.txt$/, "");
    fs.rmSync(`${base}.${KEEP_ROTATED - 1}.txt`, { force: true });
    for (let i = KEEP_ROTATED - 2; i >= 0; i--) {
      const from = `${base}.${i}.txt`;
      if (fs.existsSync(from)) fs.renameSync(from, `${base}.${i + 1}.txt`);
    }
    fs.renameSync(file, `${base}.0.txt`);
    return true;
  } catch {
    return false;
  }
}

const redact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["x-api-key"]',
    "*.password",
    "*.token",
    "*.apiKey",
    "*.apiSecret",
    "*.smtpPass",
  ],
  censor: "[redacted]",
};

let fileStream: pino.DestinationStream | null = null;

function build(level: string): pino.Logger {
  rotateLogsIfNeeded();
  fileStream = pino.destination({ dest: LOG_FILE, mkdir: true, sync: false });
  return pino(
    { level, redact, base: undefined, timestamp: pino.stdTimeFunctions.isoTime },
    pino.multistream([
      { stream: process.stdout, level: "trace" },
      { stream: fileStream, level: "trace" },
    ]),
  );
}

/** Console-only logger until initLogging() attaches the file (tests never call it). */
export let log: pino.Logger = pino({ level: process.env.LOG_LEVEL || "info", base: undefined });

export function initLogging(level = process.env.LOG_LEVEL || "info"): pino.Logger {
  log = build(level);
  return log;
}

export function setLogLevel(level: string): void {
  log.level = level;
}

/** Child logger for a subsystem, e.g. logger("scheduler"). */
export function logger(component: string): pino.Logger {
  return log.child({ component });
}
