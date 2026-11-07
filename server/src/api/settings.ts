import { Router } from "express";
import { z } from "zod";
import type { GeneralSettingsResponse, TestResult } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { invalidateSmtpHealth, runHealthChecks } from "../health.js";
import { clearFolder, pingCloudinary } from "../integrations/cloudinary.js";
import { normalizeBaseUrl } from "../integrations/http.js";
import { testSmtp } from "../integrations/mail.js";
import { PlexClient } from "../integrations/plex.js";
import { TautulliClient } from "../integrations/tautulli.js";
import { setLogLevel, logger } from "../logging.js";
import {
  effectiveTimezone,
  getApiKey,
  getSection,
  isValidTimezone,
  maskSection,
  parsePatch,
  regenerateApiKey,
  resolveDraft,
  SECTIONS,
  type SectionName,
  setSection,
  unmaskPatch,
} from "../settings.js";

const EDITABLE = ["plex", "tautulli", "smtp", "images", "content"] as const satisfies readonly SectionName[];
type Editable = (typeof EDITABLE)[number];
const isEditable = (s: string): s is Editable => (EDITABLE as readonly string[]).includes(s);

export function settingsRouter(db: DB): Router {
  const r = Router();
  const log = logger("settings");

  /* ---------------------------------- general --------------------------------- */

  const general = (): GeneralSettingsResponse => ({
    ...getSection(db, "general"),
    apiKey: getApiKey(db),
    effectiveTimezone: effectiveTimezone(db),
  });

  r.get("/general", (_req, res) => res.json(general()));

  r.put("/general", (req, res) => {
    const p = parsePatch("general", req.body);
    if (!p.ok) return res.status(400).json({ error: p.error, details: p.issues });
    if (p.patch.timezone && !isValidTimezone(p.patch.timezone)) {
      return res.status(400).json({ error: `Unknown timezone "${p.patch.timezone}"` });
    }
    const saved = setSection(db, "general", p.patch);
    setLogLevel(saved.logLevel);
    log.info({ changed: Object.keys(p.patch) }, "general settings saved");
    res.json(general());
  });

  r.post("/general/regenerate-api-key", (_req, res) => {
    regenerateApiKey(db);
    log.warn("API key regenerated");
    res.json(general());
  });

  /* ------------------------- plex / tautulli / smtp / images ------------------------- */

  r.get("/:section", (req, res, next) => {
    const s = req.params.section;
    if (!isEditable(s)) return next();
    res.json(maskSection(s, getSection(db, s)));
  });

  r.put("/:section", (req, res, next) => {
    const s = req.params.section;
    if (!isEditable(s)) return next();
    const p = parsePatch(s, req.body);
    if (!p.ok) return res.status(400).json({ error: p.error, details: p.issues });
    const patch = unmaskPatch(s, p.patch) as Record<string, unknown>;
    if (typeof patch.url === "string") patch.url = normalizeBaseUrl(patch.url);
    const saved = setSectionTyped(db, s, patch);
    log.info({ section: s, changed: Object.keys(patch) }, "settings saved");
    if (s === "smtp") invalidateSmtpHealth();
    void runHealthChecks(db);
    res.json(maskSection(s, saved));
  });

  /** Test with the values currently in the form (unsaved), masked secrets fall back to stored ones. */
  r.post("/:section/test", async (req, res, next) => {
    const s = req.params.section;
    if (!isEditable(s)) return next();
    const draft = resolveDraft(db, s, req.body?.settings ?? req.body ?? {});
    let result: TestResult;
    switch (s) {
      case "plex":
        result = await testPlex(draft as ReturnType<typeof SECTIONS.plex.parse>);
        break;
      case "tautulli":
        result = await testTautulli(draft as ReturnType<typeof SECTIONS.tautulli.parse>);
        break;
      case "smtp": {
        const sendTo = z.string().email().optional().safeParse(req.body?.sendTo);
        if (!sendTo.success) return res.status(400).json({ error: "Enter a valid email address to send the test to" });
        result = await testSmtp(draft as ReturnType<typeof SECTIONS.smtp.parse>, sendTo.data);
        break;
      }
      case "images":
        result = await pingCloudinary(draft as ReturnType<typeof SECTIONS.images.parse>);
        break;
      default:
        return res.status(404).json({ error: "this section has no test" });
    }
    log.info({ section: s, ok: result.ok }, `connection test: ${result.message}`);
    res.json(result);
  });

  r.post("/images/clear-cache", async (_req, res) => {
    const cfg = getSection(db, "images");
    const cached = Number(db.prepare("DELETE FROM image_cache").run().changes);
    let remote = 0;
    let message = `Forgot ${cached} cached image${cached === 1 ? "" : "s"}.`;
    if (cfg.mode === "cloudinary" && cfg.cloudName && cfg.apiKey && cfg.apiSecret) {
      try {
        remote = await clearFolder(cfg);
        message += ` Deleted ${remote} from Cloudinary folder "${cfg.folder}".`;
      } catch (e) {
        return res.json({ ok: false, message: `${message} Cloudinary delete failed: ${(e as Error).message}` } satisfies TestResult);
      }
    }
    log.info({ cached, remote }, "image cache cleared");
    res.json({ ok: true, message } satisfies TestResult);
  });

  return r;
}

function setSectionTyped<N extends Editable>(db: DB, name: N, patch: Record<string, unknown>) {
  return setSection(db, name, patch as Parameters<typeof setSection<N>>[2]);
}

async function testPlex(cfg: ReturnType<typeof SECTIONS.plex.parse>): Promise<TestResult> {
  const c = new PlexClient({ ...cfg, url: normalizeBaseUrl(cfg.url) });
  if (!c.configured) return { ok: false, message: "Enter the Plex URL and token." };
  try {
    const info = await c.serverInfo();
    const token = await c.tokenValidAtPlexTv();
    if (token && !token.valid) {
      return {
        ok: false,
        message: `Reached "${info.friendlyName}", but plex.tv says the token is invalid. (Plex lets this network in without a token, which hid the problem.)`,
      };
    }
    const totals = await c.libraryTotals().catch(() => null);
    return {
      ok: true,
      message: `Connected to "${info.friendlyName}" (Plex ${info.version.split("-")[0]}).`,
      details: totals ? { movies: totals.movies, shows: totals.shows, episodes: totals.episodes } : undefined,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

async function testTautulli(cfg: ReturnType<typeof SECTIONS.tautulli.parse>): Promise<TestResult> {
  const c = new TautulliClient({ ...cfg, url: normalizeBaseUrl(cfg.url) });
  if (!c.configured) return { ok: false, message: "Enter the Tautulli URL and API key." };
  try {
    const info = await c.info();
    return { ok: true, message: `Connected to Tautulli ${info.tautulli_version}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
