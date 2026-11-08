import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { runDueNewsletters } from "../src/scheduler.js";
import { describeCron, nextRuns, slotsBetween, validateCron } from "../src/schedule.js";
import { setSection } from "../src/settings.js";

function setup(cron: string, updatedAt = "2026-11-08T00:00:00.000Z") {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-sched-")), "t.db"));
  setSection(db, "general", { timezone: "America/New_York" });
  // SMTP intentionally NOT configured: sends fail fast (no network) but still claim their slot.
  db.prepare("INSERT INTO templates(name, html) VALUES('T', '<p>hi</p>')").run();
  db.prepare("INSERT INTO recipients(email) VALUES('a@example.com')").run();
  db.prepare("INSERT INTO newsletters(name, template_id, schedule, enabled, updated_at) VALUES('Weekly', 1, ?, 1, ?)").run(JSON.stringify({ cron }), updatedAt);
  return db;
}

const sends = (db: ReturnType<typeof setup>) =>
  db.prepare("SELECT trigger, scheduled_for, status, error FROM sends ORDER BY id").all() as { trigger: string; scheduled_for: string; status: string; error: string }[];

describe("scheduler", () => {
  // Sunday 2026-11-08 08:00 America/New_York (EST) = 13:00Z
  const slot = "2026-11-08T13:00:00.000Z";

  it("fires a due slot exactly once even when passes overlap (the v1 duplicate bug)", async () => {
    const db = setup("0 8 * * 0");
    const now = new Date("2026-11-08T13:00:30Z");
    await Promise.all([runDueNewsletters(db, now), runDueNewsletters(db, now), runDueNewsletters(db, now)]);
    await runDueNewsletters(db, new Date("2026-11-08T13:01:00Z"));
    const rows = sends(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trigger: "scheduled", scheduled_for: slot, status: "failed" });
    expect(rows[0]!.error).toMatch(/SMTP/);
  });

  it("does nothing before the slot", async () => {
    const db = setup("0 8 * * 0");
    await runDueNewsletters(db, new Date("2026-11-08T12:59:00Z"));
    expect(sends(db)).toHaveLength(0);
  });

  it("records a missed slot once as skipped and never sends it late", async () => {
    const db = setup("0 8 * * 0");
    const late = new Date("2026-11-08T14:00:00Z"); // an hour late
    await runDueNewsletters(db, late);
    await runDueNewsletters(db, late);
    const rows = sends(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "skipped", scheduled_for: slot });
  });

  it("ignores slots from before the newsletter was last saved", async () => {
    const db = setup("0 8 * * 0", "2026-11-08T13:00:10.000Z"); // enabled 10s after the slot
    await runDueNewsletters(db, new Date("2026-11-08T13:01:00Z"));
    expect(sends(db)).toHaveLength(0);
  });

  it("disabled newsletters never fire", async () => {
    const db = setup("0 8 * * 0");
    db.prepare("UPDATE newsletters SET enabled = 0").run();
    await runDueNewsletters(db, new Date("2026-11-08T13:00:30Z"));
    expect(sends(db)).toHaveLength(0);
  });
});

describe("schedule helpers", () => {
  it("validates cron", () => {
    expect(validateCron("0 8 * * 0")).toBeNull();
    expect(validateCron("0 8 * *")).toMatch(/5 fields/);
    expect(validateCron("61 8 * * 0")).not.toBeNull();
  });

  it("computes next runs in the configured zone across DST", () => {
    const runs = nextRuns("0 8 * * 0", "America/New_York", 2, new Date("2026-10-31T12:00:00Z"));
    expect(runs.map((d) => d.toISOString())).toEqual(["2026-11-01T13:00:00.000Z", "2026-11-08T13:00:00.000Z"]); // EST after Nov 1
  });

  it("slotsBetween is (from, to]", () => {
    const s = slotsBetween("*/30 * * * *", "UTC", new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T01:00:00Z"));
    expect(s.map((d) => d.toISOString())).toEqual(["2026-01-01T00:30:00.000Z", "2026-01-01T01:00:00.000Z"]);
  });

  it.each([
    ["0 8 * * 0", "Every Sunday at 8:00 AM"],
    ["30 18 * * *", "Every day at 6:30 PM"],
    ["0 9 * * 1,2,3,4,5", "Weekdays at 9:00 AM"],
    ["0 7 1 * *", "Monthly on the 1st at 7:00 AM"],
    ["0 7 22 * *", "Monthly on the 22nd at 7:00 AM"],
    ["0 7 11 * *", "Monthly on the 11th at 7:00 AM"],
    ["15 * * * *", "Every hour at :15"],
    ["*/5 9-17 * * *", "Custom: */5 9-17 * * *"],
  ])("describeCron(%s)", (expr, text) => {
    expect(describeCron(expr)).toBe(text);
  });
});
