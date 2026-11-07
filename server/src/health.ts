import type { HealthCheck, HealthResponse } from "../../shared/types.js";
import type { DB } from "./db/index.js";
import { cloudinaryConfigured } from "./integrations/cloudinary.js";
import { createTransport, describeSmtpError, smtpConfigured } from "./integrations/mail.js";
import { plexClient, tautulliClient } from "./services.js";
import { getSection } from "./settings.js";

/** Extra checks contributed by later subsystems (newsletters, sends). */
type Contributor = (db: DB) => HealthCheck[] | Promise<HealthCheck[]>;
const contributors: Contributor[] = [];
export function addHealthContributor(fn: Contributor): void {
  contributors.push(fn);
}

let last: HealthResponse = { checkedAt: null, checks: [] };
// SMTP login is expensive and rate-limited by providers (Gmail): verify at most every 6h.
let smtpCache: { key: string; at: number; check: HealthCheck | null } | null = null;
const SMTP_TTL = 6 * 3600_000;

export function lastHealth(): HealthResponse {
  return last;
}

export function invalidateSmtpHealth(): void {
  smtpCache = null;
}

export async function runHealthChecks(db: DB): Promise<HealthResponse> {
  const checks: HealthCheck[] = [];
  const conn = "/settings/connections";

  const plex = plexClient(db);
  if (!plex.configured) checks.push({ source: "plex", level: "warning", message: "Plex isn't set up yet", fixPath: conn });
  else {
    try {
      await plex.serverInfo();
    } catch (e) {
      checks.push({ source: "plex", level: "error", message: `Can't reach Plex: ${(e as Error).message}`, fixPath: conn });
    }
  }

  const taut = tautulliClient(db);
  if (!taut.configured) checks.push({ source: "tautulli", level: "warning", message: "Tautulli isn't set up yet", fixPath: conn });
  else {
    try {
      await taut.info();
    } catch (e) {
      checks.push({ source: "tautulli", level: "error", message: `Can't reach Tautulli: ${(e as Error).message}`, fixPath: conn });
    }
  }

  const smtp = getSection(db, "smtp");
  if (!smtpConfigured(smtp)) {
    checks.push({ source: "smtp", level: "warning", message: "Email (SMTP) isn't set up yet", fixPath: "/settings/email" });
  } else {
    const key = `${smtp.host}:${smtp.port}:${smtp.username}:${smtp.encryption}:${smtp.password.length}`;
    if (!smtpCache || smtpCache.key !== key || Date.now() - smtpCache.at > SMTP_TTL) {
      const t = createTransport(smtp);
      let check: HealthCheck | null = null;
      try {
        await t.verify();
      } catch (e) {
        check = { source: "smtp", level: "error", message: `Email login failed: ${describeSmtpError(e, smtp)}`, fixPath: "/settings/email" };
      } finally {
        t.close();
      }
      smtpCache = { key, at: Date.now(), check };
    }
    if (smtpCache.check) checks.push(smtpCache.check);
  }

  const images = getSection(db, "images");
  if (images.mode === "cloudinary" && !cloudinaryConfigured(images)) {
    checks.push({ source: "images", level: "error", message: "Image hosting is set to Cloudinary but it isn't configured", fixPath: "/settings/images" });
  }

  for (const c of contributors) {
    try {
      checks.push(...(await c(db)));
    } catch {
      /* a broken contributor must not break health */
    }
  }

  last = { checkedAt: new Date().toISOString(), checks };
  return last;
}
