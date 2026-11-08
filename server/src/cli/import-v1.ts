/**
 * Import Newzlettr v1 JSON files into the v2 database.
 *   NEWZLETTR_CONFIG_DIR=./config tsx server/src/cli/import-v1.ts <dir-with-v1-json-files>
 * Reads config.json, recipients.json, templates (emailtemplates.json) and newsletters.json if present.
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../db/index.js";
import { importV1, type V1Files } from "../importer/v1.js";
import { DB_FILE, ensureDirs } from "../paths.js";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: import-v1 <dir containing v1 json files>");
  process.exit(2);
}
const read = (name: string) => {
  const p = path.join(dir, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : undefined;
};
const files: V1Files = {
  config: read("config.json"),
  recipients: read("recipients.json"),
  templates: read("emailtemplates.json"),
  newsletters: read("newsletters.json"),
};

ensureDirs();
const db = openDb(DB_FILE);
const summary = importV1(db, files);
db.close();
console.log(JSON.stringify(summary, null, 2));
