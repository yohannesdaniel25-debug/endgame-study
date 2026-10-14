import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Plain Node is enough: analysis.js has no DOM code, which is exactly
    // why it is easy to test. (UI modules would need a "jsdom" environment.)
    environment: "node",
    include: ["test/**/*.test.js"],
    // Runs once before the test files, to provide the global `Chess`.
    setupFiles: ["test/setup.js"],
  },
});
