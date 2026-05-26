import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "memory/**/*.test.ts",
      "eval/**/*.test.ts",
      "observability/**/*.test.ts",
      "tools/**/*.test.ts",
      "endpoints/src/**/*.test.ts",
      "endpoints/examples/url-inspector-with-memory/**/*.test.ts",
      "endpoints/examples/soulforge-launch/**/*.test.ts",
      "endpoints/examples/soulforge-mcp-server/**/*.test.ts"
    ],
    globals: true
  }
});
