// server/scripts/upload-static-images.mjs
import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import cloudinary from "../cloudinary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../");        // repo root
const PUBLIC_DIR = path.join(ROOT, "public");          // where your static images live
const MAP_PATH = path.join(ROOT, "server", "cloudinary_urls.json");

const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function assertEnv() {
  const missing = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}. Check your .env.`);
    process.exit(1);
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main() {
  assertEnv();

  // Load existing map (if any) so we don't re-upload
  let map = {};
  try { map = JSON.parse(await fs.readFile(MAP_PATH, "utf8")); } catch {}

  const uploaded = [];

  for await (const file of walk(PUBLIC_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) continue;

    const rel = path.relative(PUBLIC_DIR, file).replace(/\\/g, "/");    // e.g. "platforms/android.png"
    if (map[rel]) continue; // already uploaded

    // Preserve folder structure in Cloudinary under "newzlettr"
    const folder = path.join("newzlettr", path.dirname(rel)).replace(/\\/g, "/");

    try {
      const result = await cloudinary.uploader.upload(file, {
        folder,
        use_filename: true,
        unique_filename: false,
        overwrite: false,
        resource_type: "image",
      });

      map[rel] = result.secure_url;
      uploaded.push({ rel, url: result.secure_url });
      console.log(`✓ Uploaded: ${rel} -> ${result.secure_url}`);
    } catch (err) {
      console.error(`✗ Failed: ${rel}`, err?.message || err);
    }
  }

  await fs.mkdir(path.dirname(MAP_PATH), { recursive: true });
  await fs.writeFile(MAP_PATH, JSON.stringify(map, null, 2), "utf8");

  console.log(`\nDone. ${uploaded.length} new images uploaded.`);
  console.log(`Mapping saved to: ${path.relative(ROOT, MAP_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
