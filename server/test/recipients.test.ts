import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { client, startTestServer, type TestServer } from "./helpers.js";

describe("recipients API", () => {
  let t: TestServer;
  let c: ReturnType<typeof client>;
  beforeEach(async () => {
    t = await startTestServer();
    c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
  });
  afterEach(async () => {
    await t.close();
  });

  it("creates, normalizes, rejects duplicates and bad emails", async () => {
    const a = await c.req("POST", "/api/recipients", { name: " Ann ", email: "Ann@Example.COM" });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ name: "Ann", email: "ann@example.com", enabled: true, source: "manual" });
    expect((await c.req("POST", "/api/recipients", { email: "ANN@example.com" })).status).toBe(409);
    expect((await c.req("POST", "/api/recipients", { email: "nope" })).status).toBe(400);
  });

  it("partial update only touches sent fields", async () => {
    const { body } = await c.req("POST", "/api/recipients", { name: "Bob", email: "bob@example.com" });
    const u = await c.req("PUT", `/api/recipients/${body.id}`, { enabled: false });
    expect(u.body).toMatchObject({ name: "Bob", email: "bob@example.com", enabled: false });
  });

  it("deletes and 404s afterwards", async () => {
    const { body } = await c.req("POST", "/api/recipients", { email: "cat@example.com" });
    expect((await c.req("DELETE", `/api/recipients/${body.id}`)).status).toBe(204);
    expect((await c.req("DELETE", `/api/recipients/${body.id}`)).status).toBe(404);
    expect((await c.req("GET", "/api/recipients")).body).toEqual([]);
  });

  it("rejects non-library image paths (no open proxy)", async () => {
    for (const p of ["http://169.254.169.254/", "/../etc/passwd", "/library/metadata/1/thumb?x=http://evil"]) {
      expect((await c.req("GET", `/api/plex/image?path=${encodeURIComponent(p)}`)).status).toBe(400);
    }
  });
});

describe("recipients bulk", () => {
  it("enables, disables and deletes many at once and validates input", async () => {
    const t = await startTestServer();
    try {
      const c = client(t.url);
      await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
      const ids: number[] = [];
      for (const e of ["a@example.com", "b@example.com", "c@example.com"]) ids.push((await c.req("POST", "/api/recipients", { email: e })).body.id);

      expect((await c.req("POST", "/api/recipients/bulk", { action: "disable", ids: [ids[0], ids[1], 99999] })).body).toEqual({ action: "disable", changed: 2 });
      let list = (await c.req("GET", "/api/recipients")).body as { email: string; enabled: boolean }[];
      expect(list.map((r) => [r.email, r.enabled])).toEqual([["a@example.com", false], ["b@example.com", false], ["c@example.com", true]]);

      expect((await c.req("POST", "/api/recipients/bulk", { action: "enable", ids })).body.changed).toBe(3);
      expect((await c.req("POST", "/api/recipients/bulk", { action: "delete", ids: [ids[2], ids[2]] })).body.changed).toBe(1);
      list = (await c.req("GET", "/api/recipients")).body;
      expect(list).toHaveLength(2);

      expect((await c.req("POST", "/api/recipients/bulk", { action: "nuke", ids })).status).toBe(400);
      expect((await c.req("POST", "/api/recipients/bulk", { action: "delete", ids: [] })).status).toBe(400);
    } finally {
      await t.close();
    }
  });
});
