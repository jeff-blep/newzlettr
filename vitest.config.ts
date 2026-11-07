import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/test/**/*.test.ts", "web/src/**/*.test.ts"],
    environment: "node",
    // Paths are resolved at import time, so the config dir must be set before any module loads.
    env: { LOG_LEVEL: "silent", NEWZLETTR_CONFIG_DIR: path.join(os.tmpdir(), `newzlettr-vitest-${process.pid}`) },
  },
});
