import { createApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/index.js";
import { openDb } from "./db/index.js";
import { addHealthContributor, runHealthChecks } from "./health.js";
import { newsletterHealth, runDueNewsletters } from "./scheduler.js";
import { initLogging, rotateLogsIfNeeded } from "./logging.js";
import { CONFIG_DIR, DB_FILE, ensureDirs } from "./paths.js";
import { effectiveTimezone, getApiKey, getSection } from "./settings.js";
import { registerTask, stopAllTasks } from "./tasks.js";
import { applyPendingRestore, createBackup } from "./backup.js";
import { syncPlexAccess } from "./data/plexAccess.js";
import { VERSION } from "./api/system.js";

ensureDirs();
const log = initLogging();
const restoredFrom = applyPendingRestore();
if (restoredFrom) log.warn({ previousDbSavedAs: restoredFrom }, "restored database from backup");
const db = openDb(DB_FILE);
log.level = getSection(db, "general").logLevel;
getApiKey(db); // generate on first run
// A crash mid-send leaves rows "running" forever; close them out honestly.
const stale = db
  .prepare("UPDATE sends SET status = 'failed', error = 'Interrupted (Newzlettr stopped mid-send)', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status = 'running'")
  .run().changes;
if (stale) log.warn({ count: stale }, "marked interrupted sends as failed");
addHealthContributor(newsletterHealth);

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
registerTask("newsletters", "Send Due Newsletters", MIN, async () => {
  const r = await runDueNewsletters(db);
  return r.sent || r.skipped ? `Sent ${r.sent}, skipped ${r.skipped}` : "Nothing due";
}, 10_000);
registerTask("plex-access", "Sync Plex Access", 6 * 60 * MIN, async () => {
  const s = await syncPlexAccess(db);
  return `${s.libraries} with libraries, ${s.noLibraries} without, ${s.noAccess} no access`;
}, 30_000);
registerTask("backup", "Backup Database", 7 * 24 * 60 * MIN, async () => `Created ${createBackup(db, "scheduled").name}`, 10 * MIN);
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
