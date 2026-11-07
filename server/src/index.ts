import { createApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/index.js";
import { openDb } from "./db/index.js";
import { runHealthChecks } from "./health.js";
import { initLogging, rotateLogsIfNeeded } from "./logging.js";
import { CONFIG_DIR, DB_FILE, ensureDirs } from "./paths.js";
import { effectiveTimezone, getApiKey, getSection } from "./settings.js";
import { registerTask, stopAllTasks } from "./tasks.js";
import { VERSION } from "./api/system.js";

ensureDirs();
const log = initLogging();
const db = openDb(DB_FILE);
log.level = getSection(db, "general").logLevel;
getApiKey(db); // generate on first run

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

const server = createApp(db).listen(PORT, HOST, () => {
  log.info({ version: VERSION, port: PORT, configDir: CONFIG_DIR, timezone: effectiveTimezone(db) }, "Newzlettr started");
});

const MIN = 60_000;
registerTask("health", "Check Health", 15 * MIN, async () => {
  const h = await runHealthChecks(db);
  return h.checks.length ? `${h.checks.length} issue(s)` : "All good";
}, 3_000);
registerTask("housekeeping", "Housekeeping", 60 * MIN, async () => {
  const sessions = purgeExpiredSessions(db);
  const rotated = rotateLogsIfNeeded();
  return `Purged ${sessions} expired session(s)${rotated ? ", rotated log" : ""}`;
}, 60_000);

function shutdown(signal: string) {
  log.info({ signal }, "shutting down");
  stopAllTasks();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
