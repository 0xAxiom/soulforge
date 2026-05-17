import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["memory/**/*.test.ts", "endpoints/examples/url-inspector-with-memory/**/*.test.ts"],
    globals: true
  }
});
