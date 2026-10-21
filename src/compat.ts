/**
 * Tested versions. Bump by hand, run the E2E suite (`pnpm test:e2e`), then release.
 * @oxlint/plugins always follows the installed oxlint version.
 */
export const COMPAT = {
  oxlint: "1.88.0",
  "oxlint-tsgolint": "7.0.2004",
  "eslint-plugin-sonarjs": "4.2.2",
  prettier: "3.9.10",
  // Fallback only: added when sonarjs cannot load without its ESLint peer.
  eslint: "9.39.5",
} as const;

export type CompatName = keyof typeof COMPAT;

/** Oxlint loads oxlint.config.ts through Node's native TypeScript support. */
export const MIN_NODE: readonly [number, number] = [22, 18];
