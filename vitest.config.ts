import { defineConfig } from "vitest/config";

// convex-test runs the real Convex functions (with their validators and schema) in the edge runtime.
// UI tests render markup in Node and never open a socket.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        test: {
          name: "ui",
          environment: "node",
          include: ["src/**/*.test.tsx"],
        },
      },
    ],
  },
});
