// server/lib/config.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.resolve(__dirname, "../config.json");

/** Safely read config JSON (returns {} if missing/invalid). */
async function readJsonSafe() {
  try {
    const txt = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

/** Get current config. */
export async function getConfig() {
  return await readJsonSafe();
}

/** Shallow-merge and save top-level keys; return updated config. */
export async function saveConfig(partial) {
  const current = await readJsonSafe();
  const next = { ...current, ...partial };
  await writeFile(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}
