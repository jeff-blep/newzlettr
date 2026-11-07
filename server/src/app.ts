import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import type { DB } from "./db/index.js";
import { requireAuth } from "./auth/index.js";
import { authRouter } from "./api/auth.js";
import { settingsRouter } from "./api/settings.js";
import { systemRouter } from "./api/system.js";
import { recipientsRouter } from "./api/recipients.js";
import { mediaRouter } from "./api/media.js";
import { renderRouter, templatesRouter } from "./api/templates.js";
import { logger } from "./logging.js";
import { ASSETS_DIR, WEB_DIST } from "./paths.js";

export function createApp(db: DB): express.Express {
  const app = express();
  const log = logger("http");

  app.disable("x-powered-by");
  app.set("trust proxy", false); // auth decisions use the real peer address
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.json({ limit: "2mb" }));

  // Public: health probe + email image assets (mail clients fetch these unauthenticated).
  app.get("/ping", (_req, res) => res.json({ status: "OK" }));
  // NOT "/assets" - that's where Vite puts the UI bundle.
  app.use("/email-assets", express.static(ASSETS_DIR, { maxAge: "7d", fallthrough: false }));

  app.use(requireAuth(db));
  app.use("/api/auth", authRouter(db));
  app.use("/api/settings", settingsRouter(db));
  app.use("/api/system", systemRouter(db));
  app.use("/api/recipients", recipientsRouter(db));
  app.use("/api/templates", templatesRouter(db));
  app.use("/api/render", renderRouter(db));
  app.use("/api", mediaRouter(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

  // Web UI (SPA). In dev the Vite server serves it instead.
  if (fs.existsSync(path.join(WEB_DIST, "index.html"))) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: "1h" }));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
  }

  app.use((err: Error & { status?: number; type?: string }, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status ?? (err.type === "entity.parse.failed" ? 400 : 500);
    if (status >= 500) log.error({ err, path: req.path }, "unhandled error");
    res.status(status).json({ error: status >= 500 ? "internal error" : err.message });
  });

  return app;
}
