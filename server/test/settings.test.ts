import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDb } from "../src/db/index.js";
import { MIGRATIONS } from "../src/db/migrations.js";
import { getSection, parsePatch, setSection } from "../src/settings.js";
import { client, startTestServer } from "./helpers.js";

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "newzlettr-test-"));
  return openDb(path.join(dir, "t.db"));
}

describe("migrations", () => {
  it("apply once and are idempotent", () => {
    const db = tempDb();
    const latest = MIGRATIONS.at(-1)!.version;
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(latest);
    expect(migrate(db)).toBe(latest);
  });

  it("make a scheduled slot claimable only once", () => {
    const db = tempDb();
    db.prepare("INSERT INTO newsletters(name) VALUES('Weekly')").run();
    const claim = () =>
      db
        .prepare("INSERT INTO sends(newsletter_id, trigger, scheduled_for, status) VALUES(1, 'scheduled', '2026-11-08T08:00:00Z', 'running')")
        .run();
    claim();
    expect(claim).toThrow(/UNIQUE/);
    // manual sends have no slot and never collide
    db.prepare("INSERT INTO sends(newsletter_id, trigger, status) VALUES(1, 'manual', 'sent')").run();
    db.prepare("INSERT INTO sends(newsletter_id, trigger, status) VALUES(1, 'manual', 'sent')").run();
  });
});

describe("settings sections", () => {
  it("returns defaults, persists patches, and survives bad stored values", () => {
    const db = tempDb();
    expect(getSection(db, "general")).toMatchObject({ authMethod: "forms", logLevel: "info", timezone: "" });
    setSection(db, "general", { applicationUrl: "https://news.example.com" });
    expect(getSection(db, "general").applicationUrl).toBe("https://news.example.com");
    db.prepare("UPDATE settings SET value = ? WHERE key = 'general'").run(JSON.stringify({ logLevel: "LOUD", timezone: "UTC" }));
    const g = getSection(db, "general");
    expect(g.logLevel).toBe("info"); // invalid value dropped back to default
    expect(g.timezone).toBe("UTC"); // valid sibling kept
  });

  it("parsePatch keeps only the keys that were sent", () => {
    const p = parsePatch("general", { timezone: "UTC" });
    expect(p.ok && p.patch).toEqual({ timezone: "UTC" });
    expect(parsePatch("general", { logLevel: "LOUD" }).ok).toBe(false);
  });

  it("saving one field over the API never resets the others (v1 smtpSecure bug)", async () => {
    const t = await startTestServer();
    try {
      const c = client(t.url);
      await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
      await c.req("PUT", "/api/settings/general", { applicationUrl: "https://x.example", logLevel: "debug", authMethod: "forms-local-bypass" });
      const res = await c.req("PUT", "/api/settings/general", { timezone: "UTC" });
      expect(res.body).toMatchObject({ timezone: "UTC", applicationUrl: "https://x.example", logLevel: "debug", authMethod: "forms-local-bypass" });
    } finally {
      await t.close();
    }
  });
});
