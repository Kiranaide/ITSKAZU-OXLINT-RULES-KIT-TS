/**
 * Tested versions. Bump by hand, run the E2E suite (`bun run test:e2e`), then release.
 * @oxlint/plugins always follows the installed oxlint version.
 */
export const COMPAT = {
  oxlint: "1.94.0",
  "oxlint-tsgolint": "7.0.2007",
  prettier: "3.10.1",
} as const;

export type CompatName = keyof typeof COMPAT;

/** Oxlint loads oxlint.config.ts through Node's native TypeScript support. */
export const MIN_NODE: readonly [number, number] = [22, 18];
