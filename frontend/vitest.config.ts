import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest needs the same `@/` alias the app uses, so tests can import modules
 * that reference it internally (e.g. AsyncState -> @/lib/api).
 */
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
