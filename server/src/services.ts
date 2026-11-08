import type { DB } from "./db/index.js";
import { PlexClient } from "./integrations/plex.js";
import { TautulliClient } from "./integrations/tautulli.js";
import { getSection } from "./settings.js";

/** Fresh clients from current settings (cheap; settings changes apply immediately). */
export const plexClient = (db: DB) => new PlexClient(getSection(db, "plex"));
export const tautulliClient = (db: DB) => new TautulliClient(getSection(db, "tautulli"));

/** Plex machine id is needed for every "watch on Plex" link; cache it per base URL. */
const machineIdCache = new Map<string, string>();
export async function plexMachineId(db: DB): Promise<string | null> {
  const cfg = getSection(db, "plex");
  const hit = machineIdCache.get(cfg.url);
  if (hit) return hit;
  try {
    const id = (await plexClient(db).identity()).machineIdentifier;
    machineIdCache.set(cfg.url, id);
    return id;
  } catch {
    return null;
  }
}
