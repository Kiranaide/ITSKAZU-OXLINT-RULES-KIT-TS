export const MODES = ["adopt", "strict"] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (value: unknown): value is Mode =>
  typeof value === "string" && (MODES as readonly string[]).includes(value);

/**
 * "hard" rules (bugs, security, type safety) are always errors. "soft" rules (style,
 * complexity, readability) warn in `adopt` mode and error in `strict` mode.
 */
export type Layer = "hard" | "soft";
export type RuleSpec = readonly [name: string, layer: Layer, options?: unknown];

export const PRESET_IDS = ["base", "react", "next", "node", "sonar", "anti-slop", "strict"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** Native Oxlint plugins enabled per preset. anti-slop loads through jsPlugins. */
export const PRESET_PLUGINS: Record<PresetId, string[]> = {
  base: ["typescript", "unicorn", "oxc"],
  react: ["react", "jsx-a11y"],
  next: ["nextjs"],
  node: ["node", "unicorn"],
  sonar: [],
  "anti-slop": [],
  strict: ["unicorn"],
};

export const RULES: Record<PresetId, RuleSpec[]> = {
  base: [
    ["eslint/no-unused-vars", "hard"],
    ["eslint/no-unreachable", "hard"],
    ["typescript/no-explicit-any", "hard"],
    // Type-aware rules: skipped by plain `oxlint`, run by `--type-aware`.
    ["typescript/no-unsafe-assignment", "hard"],
    ["typescript/no-unsafe-argument", "hard"],
    ["typescript/no-unsafe-call", "hard"],
    ["typescript/no-unsafe-member-access", "hard"],
    ["typescript/no-unsafe-return", "hard"],
    ["typescript/no-unsafe-type-assertion", "hard"],
    ["typescript/no-floating-promises", "hard"],
    ["typescript/no-misused-promises", "hard"],
    ["typescript/await-thenable", "hard"],
    ["typescript/only-throw-error", "hard"],
    ["typescript/no-unnecessary-condition", "soft"],
    ["typescript/no-unnecessary-type-conversion", "soft"],
    ["typescript/no-unnecessary-type-parameters", "soft"],
    ["typescript/no-unnecessary-type-assertion", "soft"],
    ["typescript/no-useless-default-assignment", "soft"],
    ["typescript/prefer-find", "soft"],
    ["typescript/prefer-nullish-coalescing", "soft"],
    ["typescript/prefer-optional-chain", "soft"],
    ["typescript/prefer-readonly", "soft"],
    ["typescript/prefer-string-starts-ends-with", "soft"],
    ["typescript/restrict-template-expressions", "soft"],
    ["typescript/strict-boolean-expressions", "soft"],
    ["typescript/switch-exhaustiveness-check", "soft"],
    ["oxc/no-accumulating-spread", "soft"],
    ["eslint/no-useless-call", "soft"],
    ["unicorn/prefer-array-find", "soft"],
    ["unicorn/prefer-array-flat-map", "soft"],
    ["unicorn/prefer-set-has", "soft"],
    ["unicorn/consistent-function-scoping", "soft"],
    ["eslint/complexity", "soft", { max: 10 }],
    ["eslint/max-depth", "soft", { max: 3 }],
    ["eslint/max-lines-per-function", "soft", { max: 80, skipBlankLines: true, skipComments: true }],
  ],
  react: [
    ["react/rules-of-hooks", "hard"],
    ["react/exhaustive-deps", "hard"],
    ["react/jsx-key", "hard"],
    ["react/no-array-index-key", "soft"],
    ["jsx-a11y/alt-text", "hard"],
    ["jsx-a11y/anchor-is-valid", "soft"],
  ],
  // Verify names against your Oxlint version; the smoke test fails if Oxlint rejects one.
  next: [
    ["nextjs/no-html-link-for-pages", "hard"],
    ["nextjs/no-sync-scripts", "hard"],
    ["nextjs/no-img-element", "soft"],
    ["nextjs/no-head-element", "soft"],
  ],
  // Verify names against your Oxlint version; the smoke test fails if Oxlint rejects one.
  node: [
    ["node/no-exports-assign", "hard"],
    ["node/no-new-require", "hard"],
    ["unicorn/prefer-node-protocol", "soft"],
    ["unicorn/no-process-exit", "soft"],
  ],
  // Sonar-style bug checks mapped to native Oxlint rules. eslint-plugin-sonarjs is
  // not used: it crashes on TypeScript 7 (no JS compiler API) and Oxlint has no
  // native sonarjs port yet. Sonar rules without a native equivalent are dropped
  // (no-identical-functions, no-hardcoded-passwords/secrets, no-clear-text-protocols,
  // no-collapsible-if, prefer-single-boolean-return, no-nested-template-literals).
  sonar: [
    // sonarjs/no-identical-conditions, no-duplicated-branches, no-all-duplicated-branches
    ["eslint/no-dupe-else-if", "hard"],
    // sonarjs/no-identical-expressions (self-comparison subset)
    ["eslint/no-self-compare", "hard"],
    ["eslint/no-constant-binary-expression", "hard"],
    // sonarjs/no-redundant-boolean
    ["eslint/no-extra-boolean-cast", "soft"],
    // sonarjs/no-inverted-boolean-check
    ["eslint/no-negated-condition", "soft"],
    // sonarjs/no-redundant-jump
    ["eslint/no-useless-return", "soft"],
    // Further native bug checks in the same spirit.
    ["eslint/no-constant-condition", "hard"],
    ["eslint/no-dupe-keys", "hard"],
    ["eslint/no-duplicate-case", "hard"],
    ["eslint/no-self-assign", "hard"],
    ["eslint/no-fallthrough", "hard"],
    ["eslint/no-unsafe-negation", "hard"],
    ["eslint/no-unsafe-optional-chaining", "hard"],
    ["eslint/use-isnan", "hard"],
    ["eslint/valid-typeof", "hard"],
    ["eslint/no-compare-neg-zero", "hard"],
    ["eslint/no-loss-of-precision", "hard"],
    ["eslint/no-async-promise-executor", "hard"],
    ["eslint/no-promise-executor-return", "hard"],
    ["eslint/no-template-curly-in-string", "soft"],
    ["eslint/no-return-assign", "soft"],
    ["eslint/no-sequences", "soft"],
  ],
  "anti-slop": [
    ["anti-slop/no-chained-type-assertions", "hard"],
    ["anti-slop/no-widen-then-assert", "hard"],
    ["anti-slop/require-safety-comment-for-type-assertion", "hard"],
    ["anti-slop/no-known-value-widening", "hard"],
    ["anti-slop/no-unsafe-dictionary-type", "hard"],
    ["anti-slop/no-array-filter-map", "soft"],
    ["anti-slop/no-reduce-accumulator-copy", "soft"],
    ["anti-slop/no-conditional-empty-object-spread", "soft"],
    ["anti-slop/no-module-mocking", "soft"],
    ["anti-slop/no-object-parameters", "soft"],
    ["anti-slop/no-reflect-apply", "soft"],
    ["anti-slop/no-reflect-get", "soft"],
    ["anti-slop/no-runtime-typeof", "soft"],
    ["anti-slop/no-shape-in-symbol-names", "soft"],
    ["anti-slop/no-unknown-parameters", "soft"],
    ["anti-slop/no-unknown-returns", "soft"],
    ["anti-slop/no-unknown-type-aliases", "soft"],
    ["anti-slop/require-readable-spacing", "soft"],
  ],
  strict: [
    ["eslint/no-nested-ternary", "soft"],
    ["eslint/no-unneeded-ternary", "soft"],
    ["eslint/no-negated-condition", "soft"],
    ["unicorn/no-unreadable-array-destructuring", "soft"],
    ["unicorn/no-unreadable-iife", "soft"],
    ["unicorn/numeric-separators-style", "soft"],
  ],
};
