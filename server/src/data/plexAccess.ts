import type { PlexAccessStatus } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import { tx } from "../db/index.js";
import type { PlexSharedUser } from "../integrations/plex.js";
import { logger } from "../logging.js";
import { plexClient, plexMachineId } from "../services.js";

const log = logger("plex-access");

export function statusFor(share: PlexSharedUser): PlexAccessStatus {
  if (share.pending) return "invited";
  return share.libraries.length ? "libraries" : "no_libraries";
}

export interface PlexAccessSummary {
  shares: number;
  libraries: number;
  noLibraries: number;
  invited: number;
  noAccess: number;
}

/** Fetches who this server is shared with (and which libraries). Throws if Plex is unreachable. */
export async function fetchShares(db: DB): Promise<PlexSharedUser[]> {
  const machineId = await plexMachineId(db);
  if (!machineId) throw new Error("Can't reach Plex — check Settings → Connections");
  return plexClient(db).sharedUsers(machineId);
}

/**
 * Updates every recipient's Plex access from the server's current shares.
 * Matched by Plex user id first (survives email changes), then by email.
 * Recipients not shared with at all become "no_access".
 */
export function applyShares(db: DB, shares: PlexSharedUser[]): PlexAccessSummary {
  const byId = new Map(shares.filter((s) => s.userId).map((s) => [s.userId, s]));
  const byEmail = new Map(shares.filter((s) => s.email).map((s) => [s.email, s]));
  const rows = db.prepare("SELECT id, email, plex_user_id FROM recipients").all() as { id: number; email: string; plex_user_id: string | null }[];
  const now = new Date().toISOString();
  const update = db.prepare("UPDATE recipients SET plex_user_id = ?, plex_status = ?, plex_libraries = ?, plex_checked_at = ? WHERE id = ?");
  const summary: PlexAccessSummary = { shares: shares.length, libraries: 0, noLibraries: 0, invited: 0, noAccess: 0 };

  tx(db, () => {
    for (const r of rows) {
      const share = (r.plex_user_id && byId.get(r.plex_user_id)) || byEmail.get(r.email.toLowerCase());
      if (!share) {
        update.run(r.plex_user_id, "no_access", "[]", now, r.id);
        summary.noAccess++;
        continue;
      }
      const status = statusFor(share);
      update.run(share.userId || r.plex_user_id, status, JSON.stringify(share.libraries), now, r.id);
      if (status === "libraries") summary.libraries++;
      else if (status === "no_libraries") summary.noLibraries++;
      else summary.invited++;
    }
  });
  return summary;
}

export async function syncPlexAccess(db: DB): Promise<PlexAccessSummary> {
  const summary = applyShares(db, await fetchShares(db));
  log.info(summary, "plex access synced");
  return summary;
}
