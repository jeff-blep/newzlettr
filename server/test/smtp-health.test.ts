import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Each verify() call takes the next outcome: "ok", or an error code to throw. */
let outcomes: string[] = [];
let verifies = 0;
vi.mock("../src/integrations/mail.js", async (orig) => {
  const real = await orig<typeof import("../src/integrations/mail.js")>();
  return {
    ...real,
    createTransport: () => ({
      verify: async () => {
        verifies++;
        const o = outcomes.shift() ?? "ok";
        if (o === "ok") return true;
        throw Object.assign(new Error(o === "EAUTH" ? "Invalid login" : "Connection timeout"), { code: o, ...(o === "EAUTH" ? { responseCode: 535 } : {}) });
      },
      close: () => {},
    }),
  };
});

const { openDb } = await import("../src/db/index.js");
const { setSection } = await import("../src/settings.js");
const { invalidateSmtpHealth, runHealthChecks, smtpRetry } = await import("../src/health.js");

function setup() {
  const db = openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nz-smtph-")), "t.db"));
  setSection(db, "smtp", { host: "smtp.gmail.com", username: "me@example.com", password: "x" });
  return db;
}
const smtpChecks = async (db: ReturnType<typeof setup>, force = false) => (await runHealthChecks(db, { force })).checks.filter((c) => c.source === "smtp");

beforeEach(() => {
  outcomes = [];
  verifies = 0;
  smtpRetry.delayMs = 0;
  invalidateSmtpHealth();
});

describe("email health check", () => {
  it("a single timeout that recovers on retry shows nothing", async () => {
    outcomes = ["ETIMEDOUT", "ok"];
    expect(await smtpChecks(setup())).toEqual([]);
    expect(verifies).toBe(2);
  });

  it("a timeout that persists shows, but isn't remembered: the next run clears it", async () => {
    const db = setup();
    outcomes = ["ETIMEDOUT", "ETIMEDOUT"];
    const first = await smtpChecks(db);
    expect(first).toHaveLength(1);
    expect(first[0]!.message).toMatch(/^Can't reach the email server/);
    outcomes = ["ok"];
    expect(await smtpChecks(db)).toEqual([]);
  });

  it("a rejected login is remembered (no re-login every 15 min) until Check now", async () => {
    const db = setup();
    outcomes = ["EAUTH"];
    expect((await smtpChecks(db))[0]!.message).toMatch(/^Email login failed/);
    expect(verifies).toBe(1); // no retry for a bad password
    expect(await smtpChecks(db)).toHaveLength(1);
    expect(verifies).toBe(1); // remembered
    outcomes = ["ok"];
    expect(await smtpChecks(db, true)).toEqual([]); // Check now re-tests
    expect(verifies).toBe(2);
  });

  it("a good result is remembered between runs", async () => {
    const db = setup();
    await smtpChecks(db);
    await smtpChecks(db);
    expect(verifies).toBe(1);
  });
});
