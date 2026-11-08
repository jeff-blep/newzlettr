import { Router } from "express";
import { z } from "zod";
import type { AuthStatus } from "../../../shared/types.js";
import type { DB } from "../db/index.js";
import {
  type AuthedRequest,
  changePassword,
  checkLogin,
  clearCookie,
  createSession,
  createUser,
  deleteSession,
  parseCookies,
  resolveAuth,
  SESSION_COOKIE,
  sessionCookie,
  userCount,
  verifyPassword,
} from "../auth/index.js";
import { logger } from "../logging.js";

const credentials = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8, "Password must be at least 8 characters").max(256),
});

// Naive in-memory brute-force brake: 10 failures per IP per 15 minutes.
const failures = new Map<string, { count: number; until: number }>();
function tooManyFailures(ip: string): boolean {
  const f = failures.get(ip);
  return !!f && f.until > Date.now() && f.count >= 10;
}
function noteFailure(ip: string): void {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 15 * 60_000 });
  else f.count++;
}

export function authRouter(db: DB): Router {
  const r = Router();
  const log = logger("auth");

  r.get("/status", (req: AuthedRequest, res) => {
    const setupRequired = userCount(db) === 0;
    const via = setupRequired ? null : resolveAuth(db, req);
    const body: AuthStatus = {
      setupRequired,
      authenticated: !!via,
      username: req.user?.username,
      localBypass: via === "local",
    };
    res.json(body);
  });

  /** First run only: create the admin account and log in. */
  r.post("/setup", async (req, res) => {
    if (userCount(db) > 0) return res.status(409).json({ error: "already set up" });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    const id = await createUser(db, parsed.data.username, parsed.data.password);
    const s = createSession(db, id);
    log.info({ username: parsed.data.username }, "admin account created");
    res.setHeader("Set-Cookie", sessionCookie(req, s.token, s.expires)).json({ ok: true });
  });

  r.post("/login", async (req, res) => {
    const ip = req.socket.remoteAddress ?? "?";
    if (tooManyFailures(ip)) return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    const parsed = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid" });
    const user = await checkLogin(db, parsed.data.username, parsed.data.password);
    if (!user) {
      noteFailure(ip);
      log.warn({ ip, username: parsed.data.username }, "failed login");
      return res.status(401).json({ error: "Invalid username or password" });
    }
    failures.delete(ip);
    const s = createSession(db, user.id);
    log.info({ ip, username: user.username }, "login");
    res.setHeader("Set-Cookie", sessionCookie(req, s.token, s.expires)).json({ ok: true });
  });

  r.post("/logout", (req, res) => {
    deleteSession(db, parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    res.setHeader("Set-Cookie", clearCookie).json({ ok: true });
  });

  /** Requires a real session (not API key / local bypass) and the current password. */
  r.post("/password", async (req: AuthedRequest, res) => {
    if (req.authVia !== "session" || !req.user) return res.status(403).json({ error: "log in to change your password" });
    const parsed = z
      .object({ currentPassword: z.string(), newPassword: credentials.shape.password })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid" });
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id) as { password_hash: string };
    if (!(await verifyPassword(parsed.data.currentPassword, row.password_hash))) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    await changePassword(db, req.user.id, parsed.data.newPassword);
    const s = createSession(db, req.user.id);
    log.info({ username: req.user.username }, "password changed; other sessions revoked");
    res.setHeader("Set-Cookie", sessionCookie(req, s.token, s.expires)).json({ ok: true });
  });

  return r;
}
