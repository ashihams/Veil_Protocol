import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30000,
    teardownTimeout: 30000,
    testTimeout: 15000,
    env: { AGENT_DEBUG_ROUTES: "0" },
  },
});
