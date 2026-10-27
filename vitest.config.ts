import { defineConfig } from "vitest/config";

// convex-test runs the real Convex functions (with their validators and schema) in the edge runtime.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
