import { defineConfig } from "vitest/config";

// Needs `pnpm build` first and network access. Set E2E_PM to npm, pnpm, yarn or bun.
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
