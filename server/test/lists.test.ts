import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { audience, getNewsletterRow } from "../src/mail/newsletter.js";
import { client, startTestServer, type TestServer } from "./helpers.js";

describe("recipient lists + newsletter audience", () => {
  let t: TestServer;
  let c: ReturnType<typeof client>;
  const ids: Record<string, number> = {};

  beforeEach(async () => {
    t = await startTestServer();
    c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
    for (const n of ["ann", "bob", "cat", "dan"]) {
      ids[n] = (await c.req("POST", "/api/recipients", { email: `${n}@example.com` })).body.id;
    }
    t.db.prepare("INSERT INTO templates(name, html) VALUES('T', '<p>x</p>')").run();
  });
  afterEach(async () => {
    await t.close();
  });

  const newsletter = async (body: Record<string, unknown>) =>
    (await c.req("POST", "/api/newsletters", { name: "N", templateId: 1, cron: "0 8 * * 0", ...body })).body as { id: number; audienceCount: number };
  const who = (id: number) => audience(t.db, getNewsletterRow(t.db, id)!).map((e) => e.split("@")[0]);

  it("creates lists with members, edits membership, and reports counts", async () => {
    const l = (await c.req("POST", "/api/recipient-lists", { name: "Donors", memberIds: [ids.ann, ids.cat] })).body;
    expect(l).toMatchObject({ name: "Donors", memberCount: 2 });
    expect((await c.req("POST", "/api/recipient-lists", { name: "donors" })).status).toBe(409);
    const m = (await c.req("POST", `/api/recipient-lists/${l.id}/members`, { add: [ids.bob, ids.ann], remove: [ids.cat] })).body;
    expect(m).toMatchObject({ added: 1, removed: 1, list: { memberCount: 2 } });
    const people = (await c.req("GET", "/api/recipients")).body as { email: string; listIds: number[] }[];
    expect(people.find((p) => p.email.startsWith("bob"))!.listIds).toEqual([l.id]);
  });

  it("All recipients = everyone on People", async () => {
    const n = await newsletter({ allRecipients: true });
    expect(who(n.id)).toEqual(["ann", "bob", "cat", "dan"]);
    expect(n.audienceCount).toBe(4);
  });

  it("lists + individuals: union, de-duplicated", async () => {
    const donors = (await c.req("POST", "/api/recipient-lists", { name: "Donors", memberIds: [ids.ann, ids.cat] })).body;
    const family = (await c.req("POST", "/api/recipient-lists", { name: "Family", memberIds: [ids.ann] })).body;
    const n = await newsletter({ allRecipients: false, listIds: [donors.id, family.id], recipientIds: [ids.ann, ids.dan] });
    expect(who(n.id)).toEqual(["ann", "cat", "dan"]); // ann is on two lists and picked: once
    expect(n.audienceCount).toBe(3);

    // list membership changes are picked up without editing the newsletter
    await c.req("POST", `/api/recipient-lists/${donors.id}/members`, { add: [ids.bob] });
    expect(who(n.id)).toEqual(["ann", "bob", "cat", "dan"]);

    // deleting a list removes it from the newsletter
    expect((await c.req("DELETE", `/api/recipient-lists/${donors.id}`)).status).toBe(204);
    const after = (await c.req("GET", `/api/newsletters/${n.id}`)).body as { listIds: number[] };
    expect(after.listIds).toEqual([family.id]);
    expect(who(n.id)).toEqual(["ann", "dan"]);

    // ignoring/deleting a person drops them from every list and newsletter
    await c.req("DELETE", `/api/recipients/${ids.dan}?ignore=1`);
    expect(who(n.id)).toEqual(["ann"]);
  });

  it("nothing picked = nobody", async () => {
    const n = await newsletter({ allRecipients: false });
    expect(who(n.id)).toEqual([]);
  });
});
