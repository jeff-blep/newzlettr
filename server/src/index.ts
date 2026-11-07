import { createApp } from "./app.js";
import { purgeExpiredSessions } from "./auth/index.js";
import { openDb } from "./db/index.js";
import { initLogging } from "./logging.js";
import { CONFIG_DIR, DB_FILE, ensureDirs } from "./paths.js";
import { effectiveTimezone, getApiKey, getSection } from "./settings.js";
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

const hourly = setInterval(() => purgeExpiredSessions(db), 3_600_000);

function shutdown(signal: string) {
  log.info({ signal }, "shutting down");
  clearInterval(hourly);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
