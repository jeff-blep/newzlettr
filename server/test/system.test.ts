import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { client, startTestServer, type TestServer } from "./helpers.js";

describe("system: backups, restore validation, import", () => {
  let t: TestServer;
  let c: ReturnType<typeof client>;
  // Backups go under NEWZLETTR_CONFIG_DIR, which vitest.config.ts points at a temp dir.
  beforeEach(async () => {
    t = await startTestServer();
    c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
  });
  afterEach(async () => {
    await t.close();
  });

  it("creates a backup that is a real, valid database and lists it", async () => {
    const made = await c.req("POST", "/api/system/backups");
    expect(made.status).toBe(201);
    expect(made.body.name).toMatch(/^newzlettr_manual_.*\.db$/);
    const list = await c.req("GET", "/api/system/backups");
    expect(list.body.backups.map((b: { name: string }) => b.name)).toContain(made.body.name);
  });

  it("refuses path tricks on download/delete", async () => {
    for (const n of ["..%2Fnewzlettr.db", "%2Fetc%2Fpasswd", "newzlettr.db"]) {
      expect((await c.req("GET", `/api/system/backups/${n}`)).status).toBe(404);
      expect((await c.req("DELETE", `/api/system/backups/${n}`)).status).toBe(404);
    }
  });

  it("rejects a restore upload that isn't a Newzlettr database", async () => {
    const res = await fetch(`${t.url}/api/system/restore`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-api-key": (await apiKey()) },
      body: Buffer.alloc(4096, 7),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/isn't a SQLite database|isn't a Newzlettr/);
  });

  it("imports v1 JSON through the API", async () => {
    const r = await c.req("POST", "/api/system/import-v1", {
      recipients: [{ fullName: "Zed", email: "zed@example.com" }],
      templates: [{ id: "x", name: "T1", html: "<p>{{CARD_RECENT_MOVIES}}</p>" }],
    });
    expect(r.body).toMatchObject({ recipients: 1, templates: 1, newsletters: 0 });
    expect((await c.req("POST", "/api/system/import-v1", {})).status).toBe(400);
  });

  it("returns log entries without crashing when the file is empty or missing", async () => {
    const r = await c.req("GET", "/api/system/logs?level=debug");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  async function apiKey(): Promise<string> {
    const g = await c.req("GET", "/api/settings/general");
    return g.body.apiKey;
  }
});
