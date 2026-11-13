import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { url: string; body: { chat_id: string; text: string; parse_mode: string } }[] = [];
let reply: { status: number; json: unknown } = { status: 200, json: { ok: true } };
vi.mock("../src/integrations/http.js", async (orig) => {
  const real = await orig<typeof import("../src/integrations/http.js")>();
  return {
    ...real,
    httpFetch: vi.fn(async (url: string, opts: { body?: string }) => {
      calls.push({ url, body: JSON.parse(opts.body ?? "{}") });
      return new Response(JSON.stringify(reply.json), { status: reply.status });
    }),
  };
});

const { openDb } = await import("../src/db/index.js");
const { setSection, getSection, maskSection } = await import("../src/settings.js");
const { eventFor, formatMessage, notifySend, wants } = await import("../src/notify/index.js");
const { sendTelegram } = await import("../src/notify/telegram.js");
const { runDueNewsletters } = await import("../src/scheduler.js");
const { sendNewsletter } = await import("../src/mail/newsletter.js");

function setup() {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-notify-")), "t.db"));
  setSection(db, "general", { timezone: "America/New_York" });
  setSection(db, "notifications", { telegramEnabled: true, telegramBotToken: "123:abc", telegramChatId: "42" });
  db.prepare("INSERT INTO templates(name, html) VALUES('T', '<p>hi</p>')").run();
  db.prepare("INSERT INTO recipients(email) VALUES('a@example.com')").run();
  db.prepare("INSERT INTO newsletters(name, template_id, schedule, enabled, updated_at) VALUES('Weekly <b>', 1, ?, 1, '2026-11-08T00:00:00.000Z')").run(
    JSON.stringify({ cron: "0 8 * * 0" }),
  );
  return db;
}
const flush = () => new Promise((r) => setTimeout(r, 20));
const rec = (o: Partial<Parameters<typeof notifySend>[1]>) =>
  ({ id: 1, newsletterId: 1, newsletterName: "Weekly", trigger: "scheduled", scheduledFor: null, status: "sent", recipientCount: 20, error: null, startedAt: "", finishedAt: "", ...o }) as Parameters<typeof notifySend>[1];

beforeEach(() => {
  calls.length = 0;
  reply = { status: 200, json: { ok: true } };
});

describe("notifications", () => {
  it("classifies sends; tests never notify", () => {
    expect(eventFor(rec({}))).toBe("sent");
    expect(eventFor(rec({ error: "Sent with warnings: x" }))).toBe("warning");
    expect(eventFor(rec({ status: "failed" }))).toBe("failed");
    expect(eventFor(rec({ status: "skipped" }))).toBe("skipped");
    expect(eventFor(rec({ trigger: "test" }))).toBeNull();
    expect(eventFor(rec({ status: "running" }))).toBeNull();
  });

  it("warnings notify if either sent or failed is on", () => {
    const off = { onSent: false, onFailed: false, onSkipped: false };
    expect(wants(off, "warning")).toBe(false);
    expect(wants({ ...off, onFailed: true }, "warning")).toBe(true);
    expect(wants({ ...off, onSent: true }, "warning")).toBe(true);
    expect(wants({ ...off, onSent: true }, "failed")).toBe(false);
  });

  it("escapes names and links Activity", () => {
    const m = formatMessage("failed", rec({ newsletterName: "A <b> & co", status: "failed", error: "SMTP <down>" }), "https://nz.example.com/activity");
    expect(m).toContain("<b>A &lt;b&gt; &amp; co</b>");
    expect(m).toContain("SMTP &lt;down&gt;");
    expect(m).toContain('<a href="https://nz.example.com/activity">');
  });

  it("a failed scheduled send messages Telegram once", async () => {
    const db = setup();
    await runDueNewsletters(db, new Date("2026-11-08T13:00:30Z"));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.telegram.org/bot123%3Aabc/sendMessage");
    expect(calls[0]!.body.chat_id).toBe("42");
    expect(calls[0]!.body.text).toMatch(/^❌ <b>Weekly &lt;b&gt;<\/b> didn't send/);
  });

  it("a missed slot sends a skipped message", async () => {
    const db = setup();
    await runDueNewsletters(db, new Date("2026-11-08T14:00:00Z"));
    await runDueNewsletters(db, new Date("2026-11-08T14:00:00Z"));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body.text).toMatch(/^⏭️ .* was skipped/);
  });

  it("respects the switches and test sends stay quiet", async () => {
    const db = setup();
    setSection(db, "notifications", { onFailed: false });
    await sendNewsletter(db, 1, { trigger: "manual" });
    await sendNewsletter(db, 1, { trigger: "test", testTo: "me@example.com" });
    await flush();
    expect(calls).toHaveLength(0);
    setSection(db, "notifications", { onFailed: true, telegramEnabled: false });
    await sendNewsletter(db, 1, { trigger: "manual" });
    await flush();
    expect(calls).toHaveLength(0);
  });

  it("a Telegram outage never breaks a send", async () => {
    const db = setup();
    reply = { status: 500, json: { description: "boom" } };
    const r = await sendNewsletter(db, 1, { trigger: "manual" });
    await flush();
    expect(r.status).toBe("failed");
    expect(calls).toHaveLength(1);
  });

  it("turns Telegram errors into plain hints and keeps the token secret", async () => {
    reply = { status: 400, json: { ok: false, description: "Bad Request: chat not found" } };
    await expect(sendTelegram({ botToken: "123:abc", chatId: "1" }, "x")).rejects.toThrow(/Send your bot a message first/);
    reply = { status: 401, json: { ok: false, description: "Unauthorized" } };
    await expect(sendTelegram({ botToken: "123:abc", chatId: "1" }, "x")).rejects.toThrow(/@BotFather/);
    const db = setup();
    expect(maskSection("notifications", getSection(db, "notifications")).telegramBotToken).toBe("********");
  });
});
