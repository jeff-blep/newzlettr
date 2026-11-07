import { Router } from "express";
import type { GeneralSettingsResponse } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { setLogLevel, logger } from "../logging.js";
import {
  effectiveTimezone,
  getApiKey,
  getSection,
  isValidTimezone,
  parsePatch,
  regenerateApiKey,
  setSection,
} from "../settings.js";

export function settingsRouter(db: DB): Router {
  const r = Router();
  const log = logger("settings");

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

  return r;
}
