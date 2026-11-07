import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Everything persistent lives here (*arr-style single volume). */
export const CONFIG_DIR = path.resolve(process.env.NEWZLETTR_CONFIG_DIR || "/config");
export const LOG_DIR = path.join(CONFIG_DIR, "logs");
export const DB_FILE = path.join(CONFIG_DIR, "newzlettr.db");
export const LOG_FILE = path.join(LOG_DIR, "newzlettr.txt");

/** Built web UI. dist/index.js -> ../../web/dist ; src/index.ts (dev) -> ../../web/dist */
export const WEB_DIST = path.resolve(here, "../../web/dist");
/** Static email assets (platform icons). */
export const ASSETS_DIR = path.resolve(here, "../assets");

export function ensureDirs(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}
