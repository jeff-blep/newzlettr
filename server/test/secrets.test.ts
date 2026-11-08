import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSection } from "../src/settings.js";
import { client, startTestServer, type TestServer } from "./helpers.js";

describe("settings secrets", () => {
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

  it("never returns secrets, keeps them when the mask is sent back, replaces them when changed", async () => {
    await c.req("PUT", "/api/settings/plex", { url: "plex.local:32400/", token: "real-token" });
    const got = await c.req("GET", "/api/settings/plex");
    expect(got.body).toEqual({ url: "http://plex.local:32400", token: "********", ignoreTlsErrors: false });
    expect(JSON.stringify(got.body)).not.toContain("real-token");

    await c.req("PUT", "/api/settings/plex", { ...got.body, ignoreTlsErrors: true });
    expect(getSection(t.db, "plex")).toMatchObject({ token: "real-token", ignoreTlsErrors: true });

    await c.req("PUT", "/api/settings/plex", { token: "new-token" });
    expect(getSection(t.db, "plex").token).toBe("new-token");
  });

  it("unset secrets come back empty, not masked", async () => {
    const got = await c.req("GET", "/api/settings/smtp");
    expect(got.body.password).toBe("");
  });

  it("rejects invalid values and unknown sections", async () => {
    expect((await c.req("PUT", "/api/settings/smtp", { port: 99999 })).status).toBe(400);
    expect((await c.req("PUT", "/api/settings/smtp", { encryption: "rot13" })).status).toBe(400);
    expect((await c.req("GET", "/api/settings/nope")).status).toBe(404);
  });

  it("test endpoints report not-configured instead of throwing", async () => {
    for (const s of ["plex", "tautulli", "smtp", "images"]) {
      const r = await c.req("POST", `/api/settings/${s}/test`, {});
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(false);
    }
  });
});
