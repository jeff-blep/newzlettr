import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: Record<string, unknown>[] = [];
vi.mock("../src/integrations/mail.js", async (orig) => {
  const real = await orig<typeof import("../src/integrations/mail.js")>();
  return {
    ...real,
    createTransport: () => ({
      sendMail: async (m: Record<string, unknown>) => {
        sent.push(m);
        return { messageId: "<x@test>" };
      },
      close: () => {},
    }),
  };
});

const { openDb } = await import("../src/db/index.js");
const { setSection } = await import("../src/settings.js");
const { sendMail } = await import("../src/mail/send.js");

function setup(copyToSender?: boolean) {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-cts-")), "t.db"));
  setSection(db, "smtp", { host: "smtp.example.com", username: "noreply@example.com", password: "x", fromName: "Kunkflix", ...(copyToSender === undefined ? {} : { copyToSender }) });
  return db;
}
const mail = { to: [] as string[], bcc: ["a@example.com", "b@example.com"], subject: "Hi", html: "<p>hi</p>" };

beforeEach(() => {
  sent.length = 0;
});

describe("copy to sender", () => {
  it("is on by default: BCC sends deliver to the sender too (unchanged behaviour)", async () => {
    await sendMail(setup(), mail);
    expect(sent[0]!.to).toBe('"Kunkflix" <noreply@example.com>');
    expect(sent[0]!.envelope).toBeUndefined();
  });

  it("off: the sender is still shown as To, but only the BCC list is delivered to", async () => {
    await sendMail(setup(false), mail);
    expect(sent[0]!.to).toBe('"Kunkflix" <noreply@example.com>');
    expect(sent[0]!.bcc).toBe("a@example.com, b@example.com");
    expect(sent[0]!.envelope).toEqual({ from: "noreply@example.com", to: ["a@example.com", "b@example.com"] });
  });

  it("doesn't touch one-per-person sends", async () => {
    await sendMail(setup(false), { to: ["a@example.com"], subject: "Hi", html: "<p>hi</p>" });
    expect(sent[0]!.to).toBe("a@example.com");
    expect(sent[0]!.envelope).toBeUndefined();
  });
});
