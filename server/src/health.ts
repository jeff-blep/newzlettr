import type { HealthCheck, HealthResponse } from "../../shared/types.js";
import type { DB } from "./db/index.js";
import { cloudinaryConfigured } from "./integrations/cloudinary.js";
import { createTransport, describeSmtpError, smtpConfigured } from "./integrations/mail.js";
import { plexClient, tautulliClient } from "./services.js";
import { getSection } from "./settings.js";
import { logger } from "./logging.js";

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

/** Network-level SMTP failures (as opposed to a rejected login) - usually a passing blip. */
const TRANSIENT_SMTP = new Set(["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET", "ECONNREFUSED", "EDNS", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);
export function isTransientSmtpError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  return TRANSIENT_SMTP.has(code) || /timed? ?out|ETIMEDOUT|ECONNRESET/i.test((e as Error)?.message ?? "");
}
/** Pause before re-trying a transient SMTP failure (tests set this to 0). */
export const smtpRetry = { delayMs: 5_000 };

async function verifySmtp(smtp: Parameters<typeof createTransport>[0]): Promise<void> {
  const t = createTransport(smtp);
  try {
    await t.verify();
  } finally {
    t.close();
  }
}

/** `force` (System > Status "Check now") re-tests email instead of using the remembered result. */
export async function runHealthChecks(db: DB, opts: { force?: boolean } = {}): Promise<HealthResponse> {
  if (opts.force) invalidateSmtpHealth();
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
      let check: HealthCheck | null = null;
      let transient = false;
      try {
        await verifySmtp(smtp);
      } catch (first) {
        let e = first;
        if (isTransientSmtpError(first)) {
          // One blip (a brief internet drop) shouldn't raise an alarm: try once more.
          await new Promise((r) => setTimeout(r, smtpRetry.delayMs));
          try {
            await verifySmtp(smtp);
            e = null;
          } catch (second) {
            e = second;
          }
        }
        if (e) {
          transient = isTransientSmtpError(e);
          check = transient
            ? { source: "smtp", level: "error", message: `Can't reach the email server: ${describeSmtpError(e, smtp)}`, fixPath: "/settings/email" }
            : { source: "smtp", level: "error", message: `Email login failed: ${describeSmtpError(e, smtp)}`, fixPath: "/settings/email" };
        }
      }
      // Connection problems are re-checked every run (they clear on their own); a good result
      // or a rejected login is remembered so we don't log in to the provider every 15 minutes.
      smtpCache = transient ? null : { key, at: Date.now(), check };
      if (check) checks.push(check);
    } else if (smtpCache.check) checks.push(smtpCache.check);
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

/**
 * Re-run health checks after a change without making the caller wait. Failures (Plex down,
 * or the database already closed during shutdown/tests) are logged, never left unhandled.
 */
export function refreshHealthInBackground(db: DB): void {
  runHealthChecks(db).catch((e: unknown) => logger("health").debug({ err: e }, "background health check failed"));
}
