import crypto from "node:crypto";
import { promisify } from "node:util";
import net from "node:net";
import type { NextFunction, Request, Response } from "express";
import type { DB } from "../db/index.js";
import { getApiKey, getSection } from "../settings.js";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEYLEN = 64;

export const SESSION_COOKIE = "newzlettr_session";
const SESSION_DAYS = 30;

/* -------------------------------- passwords -------------------------------- */

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/* ---------------------------------- users ---------------------------------- */

export function userCount(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
}

export async function createUser(db: DB, username: string, password: string): Promise<number> {
  const hash = await hashPassword(password);
  const res = db.prepare("INSERT INTO users(username, password_hash) VALUES(?, ?)").run(username, hash);
  return Number(res.lastInsertRowid);
}

export async function checkLogin(db: DB, username: string, password: string): Promise<{ id: number; username: string } | null> {
  const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!row) {
    // Equalize timing with the found-user path.
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, row.password_hash)) ? { id: row.id, username: row.username } : null;
}

export async function changePassword(db: DB, userId: number, newPassword: string): Promise<void> {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(await hashPassword(newPassword), userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

/* --------------------------------- sessions -------------------------------- */

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(db: DB, userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db.prepare("INSERT INTO sessions(id, user_id, expires_at) VALUES(?, ?, ?)").run(sha256(token), userId, expires.toISOString());
  return { token, expires };
}

export function sessionUser(db: DB, token: string | undefined): { id: number; username: string } | null {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
    .get(sha256(token)) as { id: number; username: string } | undefined;
  return row ?? null;
}

export function deleteSession(db: DB, token: string | undefined): void {
  if (token) db.prepare("DELETE FROM sessions WHERE id = ?").run(sha256(token));
}

export function purgeExpiredSessions(db: DB): number {
  return Number(db.prepare("DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')").run().changes);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(req: Request, token: string, expires: Date): string {
  const secure = req.secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`;
}

export const clearCookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/* ------------------------------ local addresses ----------------------------- */

/**
 * True for loopback / RFC1918 / link-local / ULA addresses. Uses the TCP peer address only -
 * never X-Forwarded-For - so a header can't fake "local" (same caveat as the *arr apps: behind a
 * reverse proxy on the same host, every request looks local; use plain "forms" there).
 */
export function isLocalAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = addr.startsWith("::ffff:") ? addr.slice(7) : addr;
  if (net.isIPv4(a)) {
    const [o1, o2] = a.split(".").map(Number) as [number, number];
    return (
      o1 === 127 || o1 === 10 || (o1 === 172 && o2 >= 16 && o2 <= 31) || (o1 === 192 && o2 === 168) || (o1 === 169 && o2 === 254)
    );
  }
  if (net.isIPv6(a)) {
    const l = a.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  return false;
}

/* -------------------------------- middleware -------------------------------- */

export interface AuthedRequest extends Request {
  user?: { id: number; username: string };
  authVia?: "session" | "apikey" | "local";
}

const PUBLIC_API = new Set(["/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/logout"]);

export function resolveAuth(db: DB, req: AuthedRequest): "session" | "apikey" | "local" | null {
  const key = req.get("x-api-key") ?? (typeof req.query.apikey === "string" ? req.query.apikey : undefined);
  if (key) {
    const real = getApiKey(db);
    return key.length === real.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real)) ? "apikey" : null;
  }
  const user = sessionUser(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
  if (user) {
    req.user = user;
    return "session";
  }
  if (userCount(db) > 0 && getSection(db, "general").authMethod === "forms-local-bypass" && isLocalAddress(req.socket.remoteAddress)) {
    return "local";
  }
  return null;
}

/** Guards /api/*. UI files and /ping stay public so the login page can load. */
export function requireAuth(db: DB) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/") || PUBLIC_API.has(req.path)) return next();
    if (userCount(db) === 0) return res.status(401).json({ error: "setup required", setupRequired: true });
    const via = resolveAuth(db, req);
    if (!via) return res.status(401).json({ error: "unauthorized" });
    req.authVia = via;
    next();
  };
}
