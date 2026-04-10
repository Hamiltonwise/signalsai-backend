import { defineConfig } from "vitest/config";
import * as path from "path";

export default defineConfig({
  test: {
    // Run all tests in /tests directory
    include: ["tests/**/*.test.ts"],
    // Exclude e2e (those use Playwright, run separately)
    exclude: ["tests/e2e/**", "node_modules/**"],
    // No DOM needed for these tests (static analysis + logic)
    environment: "node",
    // Show verbose output for Dave's confidence
    reporters: ["verbose"],
    // Timeout per test
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
    },
  },
});
