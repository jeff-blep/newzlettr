import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/test/**/*.test.ts", "web/src/**/*.test.ts"],
    environment: "node",
    env: { LOG_LEVEL: "silent" },
  },
});
