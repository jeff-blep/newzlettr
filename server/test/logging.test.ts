import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("logging", () => {
  it("component loggers created before initLogging still write to the log file and follow the level", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nz-log-"));
    process.env.NEWZLETTR_CONFIG_DIR = dir;
    const { logger, initLogging, setLogLevel } = await import("../src/logging.js?fresh=" + Date.now());
    const early = logger("early"); // like module-level `const log = logger("mail")`
    fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
    const root = initLogging("info");
    early.info({ x: 1 }, "hello file");
    early.debug("hidden at info");
    setLogLevel("debug");
    early.debug("visible at debug");
    root.flush();
    await new Promise((r) => setTimeout(r, 200));
    const text = fs.readFileSync(path.join(dir, "logs", "newzlettr.txt"), "utf8");
    expect(text).toContain('"component":"early"');
    expect(text).toContain("hello file");
    expect(text).not.toContain("hidden at info");
    expect(text).toContain("visible at debug");
  });
});
