import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { openDb, type DB } from "../src/db/index.js";
import { createApp } from "../src/app.js";

export interface TestServer {
  db: DB;
  url: string;
  close(): Promise<void>;
}

/** Fresh temp DB + app on a random port. Every test gets its own. */
export async function startTestServer(): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "newzlettr-test-"));
  const db = openDb(path.join(dir, "test.db"));
  const server: Server = await new Promise((resolve) => {
    const s = createApp(db).listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    db,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) =>
        server.close(() => {
          db.close();
          fs.rmSync(dir, { recursive: true, force: true });
          resolve();
        }),
      ),
  };
}

/** Minimal cookie-jar client. */
export function client(base: string) {
  let cookie = "";
  return {
    async req(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
      const res = await fetch(base + p, {
        method,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0]!;
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : undefined };
    },
    clearCookie() {
      cookie = "";
    },
  };
}
