import nodemailer, { type Transporter } from "nodemailer";
import type { Section } from "../settings.js";

export type SmtpConfig = Section<"smtp">;

export function smtpConfigured(cfg: SmtpConfig): boolean {
  return !!cfg.host && !!(cfg.fromAddress || cfg.username);
}

export function fromHeader(cfg: SmtpConfig): string {
  const addr = cfg.fromAddress || cfg.username;
  const name = cfg.fromName.replace(/"/g, "'");
  return name ? `"${name}" <${addr}>` : addr;
}

export function createTransport(cfg: SmtpConfig, opts: { pool?: boolean } = {}): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.encryption === "ssl",
    requireTLS: cfg.encryption === "starttls",
    ignoreTLS: cfg.encryption === "none",
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    tls: { rejectUnauthorized: !cfg.ignoreTlsErrors },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    pool: opts.pool ?? false,
    maxConnections: 2,
  });
}

/** Friendlier text for the common SMTP failures. */
export function describeSmtpError(e: unknown, cfg: SmtpConfig): string {
  const err = e as { code?: string; responseCode?: number; message?: string; command?: string };
  if (err.code === "EAUTH" || err.responseCode === 535) {
    return /gmail/i.test(cfg.host)
      ? "Gmail rejected the login. Use an App Password (Google Account → Security → App passwords), not your normal password."
      : "The SMTP server rejected the username or password.";
  }
  if (err.code === "ESOCKET" && /wrong version number|ssl3_get_record/i.test(err.message ?? "")) {
    return `TLS mismatch on port ${cfg.port}. Port 465 usually needs "SSL/TLS"; 587 needs "STARTTLS".`;
  }
  if (cfg.port === 465 && cfg.encryption !== "ssl") return `Port 465 expects "SSL/TLS" encryption — change Encryption or use port 587 with STARTTLS.`;
  if (cfg.port === 587 && cfg.encryption === "ssl") return `Port 587 expects "STARTTLS" — change Encryption or use port 465 with SSL/TLS.`;
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION") return `Couldn't connect to ${cfg.host}:${cfg.port} (${err.code}).`;
  if (err.code === "ECONNREFUSED") return `Connection refused by ${cfg.host}:${cfg.port}.`;
  if (err.code === "EDNS" || err.code === "ENOTFOUND") return `Can't resolve ${cfg.host}.`;
  return err.message ?? String(e);
}

export async function testSmtp(cfg: SmtpConfig, sendTo?: string): Promise<{ ok: boolean; message: string }> {
  if (!smtpConfigured(cfg)) return { ok: false, message: "Enter at least the SMTP server and a From address." };
  const t = createTransport(cfg);
  try {
    await t.verify();
    if (!sendTo) return { ok: true, message: `Connected to ${cfg.host}:${cfg.port} and logged in.` };
    await t.sendMail({
      from: fromHeader(cfg),
      to: sendTo,
      subject: "Newzlettr test email",
      text: "If you can read this, Newzlettr can send email. 🎉",
      html: "<p>If you can read this, <b>Newzlettr</b> can send email. 🎉</p>",
    });
    return { ok: true, message: `Test email sent to ${sendTo}.` };
  } catch (e) {
    return { ok: false, message: describeSmtpError(e, cfg) };
  } finally {
    t.close();
  }
}
