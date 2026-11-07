import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeShares } from "../src/api/recipients.js";
import type { PlexSharedUser } from "../src/integrations/plex.js";
import { client, startTestServer, type TestServer } from "./helpers.js";

const share = (userId: string, email: string, extra: Partial<PlexSharedUser> = {}): PlexSharedUser => ({
  userId,
  username: email.split("@")[0]!,
  title: email.split("@")[0]!.toUpperCase(),
  email,
  pending: false,
  libraries: ["Movies"],
  allLibraries: false,
  ...extra,
});

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
    expect(a.body).toMatchObject({ name: "Ann", email: "ann@example.com", source: "manual", listIds: [] });
    expect(a.body).not.toHaveProperty("enabled");
    expect((await c.req("POST", "/api/recipients", { email: "ANN@example.com" })).status).toBe(409);
    expect((await c.req("POST", "/api/recipients", { email: "nope" })).status).toBe(400);
  });

  it("partial update only touches sent fields", async () => {
    const { body } = await c.req("POST", "/api/recipients", { name: "Bob", email: "bob@example.com" });
    const u = await c.req("PUT", `/api/recipients/${body.id}`, { name: "Robert" });
    expect(u.body).toMatchObject({ name: "Robert", email: "bob@example.com" });
  });

  it("deletes; with ignore=1 the person lands on the Ignore list", async () => {
    const a = (await c.req("POST", "/api/recipients", { name: "Ann", email: "ann@example.com" })).body;
    const b = (await c.req("POST", "/api/recipients", { name: "Bob", email: "bob@example.com" })).body;
    expect((await c.req("DELETE", `/api/recipients/${a.id}`)).status).toBe(204);
    expect((await c.req("DELETE", `/api/recipients/${b.id}?ignore=1`)).status).toBe(204);
    expect((await c.req("DELETE", `/api/recipients/${b.id}`)).status).toBe(404);
    const ignored = (await c.req("GET", "/api/recipients/ignored")).body as { email: string; name: string }[];
    expect(ignored.map((p) => [p.name, p.email])).toEqual([["Bob", "bob@example.com"]]);
  });

  it("bulk delete with and without ignore, and validation", async () => {
    const ids: number[] = [];
    for (const e of ["a@example.com", "b@example.com", "c@example.com"]) ids.push((await c.req("POST", "/api/recipients", { email: e })).body.id);
    expect((await c.req("POST", "/api/recipients/bulk-delete", { ids: [ids[0], 99999], ignore: false })).body).toEqual({ deleted: 1, ignored: 0 });
    expect((await c.req("POST", "/api/recipients/bulk-delete", { ids: [ids[1], ids[2], ids[2]], ignore: true })).body).toEqual({ deleted: 2, ignored: 2 });
    expect((await c.req("GET", "/api/recipients")).body).toEqual([]);
    expect(((await c.req("GET", "/api/recipients/ignored")).body as unknown[]).length).toBe(2);
    expect((await c.req("POST", "/api/recipients/bulk-delete", { ids: [] })).status).toBe(400);
  });

  it("Import from Plex skips ignored people (by Plex id or email) until they're un-ignored", async () => {
    // First import brings in two people.
    const shares = [share("101", "ann@example.com"), share("102", "bob@example.com")];
    expect(mergeShares(t.db, shares)).toMatchObject({ added: 2, skippedIgnored: 0 });
    const people = (await c.req("GET", "/api/recipients")).body as { id: number; email: string }[];
    const bob = people.find((p) => p.email === "bob@example.com")!;

    // Ignore Bob; re-import must not bring him back, even if his email changed (matched by Plex id).
    await c.req("DELETE", `/api/recipients/${bob.id}?ignore=1`);
    expect(mergeShares(t.db, [share("101", "ann@example.com"), share("102", "bob.new@example.com")])).toMatchObject({ added: 0, skippedIgnored: 1, alreadyPresent: 1 });

    // Pending invites and users without email are skipped too.
    expect(mergeShares(t.db, [share("103", "cat@example.com", { pending: true }), share("104", "")])).toMatchObject({ skippedPending: 1, skippedNoEmail: 1, added: 0 });

    // Friendship repaired: un-ignore, and the next import brings him back.
    const ignored = (await c.req("GET", "/api/recipients/ignored")).body as { id: number }[];
    expect((await c.req("POST", "/api/recipients/ignored/remove", { ids: [ignored[0]!.id] })).body).toEqual({ removed: 1 });
    expect(mergeShares(t.db, [share("102", "bob@example.com")])).toMatchObject({ added: 1, skippedIgnored: 0 });
  });

  it("adding someone by hand lifts their ignore", async () => {
    const b = (await c.req("POST", "/api/recipients", { email: "bob@example.com" })).body;
    await c.req("DELETE", `/api/recipients/${b.id}?ignore=1`);
    await c.req("POST", "/api/recipients", { email: "bob@example.com" });
    expect((await c.req("GET", "/api/recipients/ignored")).body).toEqual([]);
  });

  it("rejects non-library image paths (no open proxy)", async () => {
    for (const p of ["http://169.254.169.254/", "/../etc/passwd", "/library/metadata/1/thumb?x=http://evil"]) {
      expect((await c.req("GET", `/api/plex/image?path=${encodeURIComponent(p)}`)).status).toBe(400);
    }
  });
});
