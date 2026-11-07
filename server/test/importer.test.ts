import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { importV1, parseFrom } from "../src/importer/v1.js";
import { v1ScheduleToCron } from "../src/schedule.js";
import { getSection } from "../src/settings.js";

const tempDb = () => openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-imp-")), "t.db"));

// Synthetic data shaped like a real v1 install. No real people.
const v1 = {
  config: {
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "sender@example.com",
    smtpPass: "app-password",
    fromAddress: "Example Newzlettr <sender@example.com>",
    plexUrl: "http://192.0.2.10:32400/",
    plexToken: "plex-token",
    tautulliUrl: "http://192.0.2.10:8181",
    tautulliApiKey: "tautulli-key",
    lookbackDays: 7,
    ownerRecommendation: { plexItemId: "12345", note: "Watch this" },
    imageHost: "cloudinary",
    cloudinary: { cloudName: "demo", apiKey: "k", apiSecret: "s", folder: "newzlettr" },
  },
  recipients: [
    { fullName: "Ann Example", email: "Ann@Example.com" },
    { fullName: "Bob Example", email: "bob@example.com" },
    { fullName: "Bad", email: "not-an-email" },
  ],
  templates: [{ id: "tpl1", name: "Sept. 2026", html: "<p>{{CARD_RECENT_MOVIES}}</p>" }],
  newsletters: [
    {
      id: "n1",
      name: "Weekly",
      subject: "This Week",
      templateId: "tpl1",
      recipients: ["ann@example.com", "bob@example.com"],
      sendAsBcc: true,
      schedule: { mode: "standard", frequency: "week", dayOfWeek: "sunday", hour: 8, minute: 0 },
      enabled: true,
      historyDays: 7,
    },
    {
      id: "n2",
      name: "Just Ann",
      templateName: "sept. 2026",
      recipients: ["ann@example.com"],
      schedule: { cron: "30 9 1 * *" },
      enabled: false,
    },
  ],
};

describe("v1 importer", () => {
  it("imports settings, recipients, templates and newsletters (disabled)", () => {
    const db = tempDb();
    const s = importV1(db, v1);
    expect(s).toMatchObject({ recipients: 2, templates: 1, newsletters: 2, hostPick: true });
    expect(s.settings).toEqual(expect.arrayContaining(["Plex", "Tautulli", "Email", "Images", "Default history"]));

    expect(getSection(db, "plex")).toMatchObject({ url: "http://192.0.2.10:32400", token: "plex-token" });
    expect(getSection(db, "smtp")).toMatchObject({
      encryption: "starttls",
      username: "sender@example.com",
      fromName: "Example Newzlettr",
      fromAddress: "sender@example.com",
    });
    expect(getSection(db, "images").mode).toBe("cloudinary");

    const nls = db.prepare("SELECT name, schedule, enabled, all_recipients, template_id FROM newsletters ORDER BY id").all() as {
      name: string;
      schedule: string;
      enabled: number;
      all_recipients: number;
      template_id: number;
    }[];
    expect(nls.every((n) => n.enabled === 0)).toBe(true);
    expect(JSON.parse(nls[0]!.schedule).cron).toBe("0 8 * * 0");
    expect(nls[0]!.all_recipients).toBe(1);
    expect(nls[1]!.all_recipients).toBe(0);
    expect(nls[1]!.template_id).toBe(nls[0]!.template_id); // matched by name, case-insensitive
    const linked = db.prepare("SELECT COUNT(*) AS n FROM newsletter_recipients").get() as { n: number };
    expect(linked.n).toBe(1);
    expect(s.notes.join(" ")).toMatch(/Weekly.*disabled/);
  });

  it("is safe to run twice", () => {
    const db = tempDb();
    importV1(db, v1);
    importV1(db, v1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM recipients").get() as { n: number }).n).toBe(2);
    expect((db.prepare("SELECT COUNT(*) AS n FROM templates").get() as { n: number }).n).toBe(1);
  });
});

describe("helpers", () => {
  it("parseFrom", () => {
    expect(parseFrom("Kunk News <a@b.co>")).toEqual({ name: "Kunk News", address: "a@b.co" });
    expect(parseFrom('"Quoted" <a@b.co>')).toEqual({ name: "Quoted", address: "a@b.co" });
    expect(parseFrom("a@b.co")).toEqual({ name: "", address: "a@b.co" });
  });

  it.each([
    [{ frequency: "day", hour: 7, minute: 30 }, "30 7 * * *"],
    [{ frequency: "week", dayOfWeek: "friday", hour: 9 }, "0 9 * * 5"],
    [{ frequency: "month", dayOfMonth: 31, hour: 9 }, "0 9 28 * *"],
    [{ frequency: "year", month: 0, hour: 9 }, "0 9 1 1 *"],
    [{ frequency: "hour", minute: 15 }, "15 * * * *"],
    [{ cron: "bogus" }, "0 8 * * 0"],
  ])("v1ScheduleToCron(%o) = %s", (input, expected) => {
    expect(v1ScheduleToCron(input)).toBe(expected);
  });
});
