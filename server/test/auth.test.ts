import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, isLocalAddress, verifyPassword } from "../src/auth/index.js";
import { getApiKey, setSection } from "../src/settings.js";
import { client, startTestServer, type TestServer } from "./helpers.js";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("isLocalAddress", () => {
  it.each([
    ["127.0.0.1", true],
    ["::1", true],
    ["::ffff:192.168.1.20", true],
    ["10.20.30.40", true],
    ["172.16.0.5", true],
    ["172.32.0.5", false],
    ["8.8.8.8", false],
    ["fd12::1", true],
    ["2001:db8::1", false],
    [undefined, false],
  ])("%s -> %s", (addr, expected) => {
    expect(isLocalAddress(addr)).toBe(expected);
  });
});

describe("auth flow", () => {
  let t: TestServer;
  beforeEach(async () => {
    t = await startTestServer();
  });
  afterEach(async () => {
    await t.close();
  });

  it("requires setup first, then protects the API", async () => {
    const c = client(t.url);
    expect((await c.req("GET", "/api/auth/status")).body).toMatchObject({ setupRequired: true, authenticated: false });
    expect((await c.req("GET", "/api/settings/general")).status).toBe(401);

    expect((await c.req("POST", "/api/auth/setup", { username: "admin", password: "short" })).status).toBe(400);
    expect((await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" })).status).toBe(200);
    // setup is one-shot
    expect((await c.req("POST", "/api/auth/setup", { username: "evil", password: "longenough1" })).status).toBe(409);

    // setup logged us in
    expect((await c.req("GET", "/api/auth/status")).body).toMatchObject({ authenticated: true, username: "admin" });
    expect((await c.req("GET", "/api/settings/general")).status).toBe(200);

    await c.req("POST", "/api/auth/logout");
    expect((await c.req("GET", "/api/settings/general")).status).toBe(401);
  });

  it("logs in with correct credentials only", async () => {
    const c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
    c.clearCookie();
    expect((await c.req("POST", "/api/auth/login", { username: "admin", password: "nope-nope" })).status).toBe(401);
    expect((await c.req("POST", "/api/auth/login", { username: "ADMIN", password: "longenough1" })).status).toBe(200);
    expect((await c.req("GET", "/api/system/status")).status).toBe(200);
  });

  it("accepts the API key and rejects a wrong one", async () => {
    const c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
    c.clearCookie();
    const key = getApiKey(t.db);
    expect((await c.req("GET", "/api/system/status", undefined, { "x-api-key": key })).status).toBe(200);
    expect((await c.req("GET", "/api/system/status", undefined, { "x-api-key": "x".repeat(32) })).status).toBe(401);
  });

  it("local bypass only applies when enabled", async () => {
    const c = client(t.url);
    await c.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
    c.clearCookie();
    expect((await c.req("GET", "/api/system/status")).status).toBe(401);
    setSection(t.db, "general", { authMethod: "forms-local-bypass" });
    // test client connects from 127.0.0.1
    expect((await c.req("GET", "/api/system/status")).status).toBe(200);
    expect((await c.req("GET", "/api/auth/status")).body).toMatchObject({ authenticated: true, localBypass: true });
  });

  it("changing the password revokes other sessions", async () => {
    const a = client(t.url);
    const b = client(t.url);
    await a.req("POST", "/api/auth/setup", { username: "admin", password: "longenough1" });
    await b.req("POST", "/api/auth/login", { username: "admin", password: "longenough1" });
    expect((await a.req("POST", "/api/auth/password", { currentPassword: "bad", newPassword: "newpassword1" })).status).toBe(400);
    expect((await a.req("POST", "/api/auth/password", { currentPassword: "longenough1", newPassword: "newpassword1" })).status).toBe(200);
    expect((await a.req("GET", "/api/system/status")).status).toBe(200); // a got a fresh session
    expect((await b.req("GET", "/api/system/status")).status).toBe(401); // b was revoked
  });
});
