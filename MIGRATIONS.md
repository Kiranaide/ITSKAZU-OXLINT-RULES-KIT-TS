# TS 7 + oxlint-tsgolint migration plan for `@kiranaide/oxlint-kit`

Status: **implemented** (see `.changeset/ts7-type-aware.md`) · Last researched: 2026-10-22

Corrections from implementation spikes (2026-10-22):

- `oxlint-tsgolint` 7.0.2004 does **not** require TS 7: it bundles `tsgolint.exe` and runs type-aware on TS 5/6/7/none. The "type-aware requires TS 7" premise was wrong; the TS prompt exists only because of the SonarJS crash surface.
- The 9 "unregistered" SonarJS rules all load fine through oxlint 1.88.0's bridge; the exclusion list was dropped.
- `meta.docs.requiresTypeChecking` is real (71 of 295 rules in 4.2.2) — the generator approach works.
- The §6 fallback wrapper needed a rewrite: the parent-based redirect misses `ts-api-utils` (sonarjs's dependency, outside the sonarjs dir) and any partial install where `typescript` is unresolvable. The shipped `templates/sonarjs-ts6.cjs` is resolution-based (redirects any `require("typescript")` that resolves to a TS 7+ package) with a throw-fallback.
- `bunx ts5to6` does not exist; the tool is `@andrewbranch/ts5to6`.

---

## 1. Background

### The problem

Running the generated setup in a project on TypeScript 7 crashes:

```
node_modules\eslint-plugin-sonarjs\cjs\helpers\type.js:202
const NOTHING_TYPE_FLAGS = typescript_1.default.TypeFlags.Void | ...
TypeError: Cannot read properties of undefined (reading 'Void')
```

### Root cause

- TypeScript 7 (stable since July 2026) is a native Go compiler published as the normal `typescript` package. It ships **no JavaScript compiler API**: there is no `lib/typescript.js` and no `TypeFlags`.
- `eslint-plugin-sonarjs` 4.2.x calls `require("typescript")` and reads `TypeFlags` **when the module loads**. So the whole plugin crashes before any rule runs.
- SonarJS declares `typescript: ">=5 <6.1.0"`. Its native TS 7 analyzer work was closed without merging, so there is no upstream fix to wait for.

### Facts that shape the solution

- Microsoft publishes `@typescript/typescript6`. It re-exports the TS 6.0 API and adds a `tsc6` binary. The documented setup installs both versions under aliases:
  - `"typescript": "npm:@typescript/typescript6@^6.0.2"`: anything that does `require("typescript")` gets the TS 6 API.
  - `"@typescript/native": "npm:typescript@^7.0.2"`: provides the TS 7 `tsc` binary.
- `oxlint-tsgolint` runs Oxlint's type-aware rules and **requires TS 7.0+**. It uses its own bundled typescript-go, so the alias doesn't affect it.
- Oxlint JS plugins receive **no type information** (`parserServices` is empty). SonarJS's type-aware rules therefore cannot work through `jsPlugins` with any TS version. Their checks must be replaced with tsgolint rules.
- Nine SonarJS rules exist in the plugin but are **not registered** by Oxlint's JS bridge. Naming any of them in the config makes oxlint fail to parse it:
  `async-test-assertions`, `hooks-before-test-cases`, `no-duplicate-test-title`, `no-empty-test-title`, `no-floating-point-equality`, `no-forced-browser-interaction`, `no-trivial-assertions`, `prefer-specific-assertions`, `super-linear-regex`.

---

## 2. Decisions

1. Use the **TS 6 + TS 7 alias pair** in both the kit repo and target projects. This replaces any resolver hack.
2. Turn on **type-aware linting** (`options.typeAware: true`) with `oxlint-tsgolint`.
3. Keep `eslint-plugin-sonarjs` for its **syntax-only rules**. Set its type-aware rules to `off`, and leave the 9 unregistered rules out of the config entirely.
4. Replace SonarJS's type-aware coverage with the **strict tsgolint `typescript/*` rules**.
5. Ask the user before changing their `typescript` dependency. Teams that refuse the alias get an opt-in fallback (section 6).

---

## 3. Part A — Upgrade the kit repo

### A1. devDependencies

```jsonc
"devDependencies": {
  "@changesets/cli": "^2.29.0",
  "@types/cross-spawn": "^6.0.6",
  "@types/node": "^22.18.0",
  "@typescript/native": "npm:typescript@^7.0.2",
  "typescript": "npm:@typescript/typescript6@^6.0.2",
  "oxlint": "latest",
  "oxlint-tsgolint": "latest",
  "eslint-plugin-sonarjs": "^4.2.0",
  "tsup": "^8.5.0",
  "vitest": "^3.2.0"
}
```

Pin the `latest` entries to real versions after the first install.

Why the kit needs the alias too:

- `tsup` uses the TypeScript API to generate `.d.ts` files.
- The preset generator script (B5) has to `require("eslint-plugin-sonarjs")`, which needs the TS 6 API.

### A2. Verify both compilers

```bash
bun install
bunx tsc --version     # 7.x
bunx tsc6 --version    # 6.x
node -e "console.log(typeof require('typescript').TypeFlags)"   # → object
```

### A3. Migrate tsconfig

```bash
bunx ts5to6
bun run typecheck   # "tsc --noEmit" now runs on TS 7
bun run build       # confirm tsup still emits .d.ts
```

TS 7 removes options that TS 6 deprecated, for example `baseUrl`. Fix whatever `tsc` reports.

### A4. Lint the kit with its own generated config

Run the same `oxlint.config.ts` the CLI produces (Part B) against the kit's own code.

---

## 4. Part B — CLI changes for target projects

### B1. Detect the target's TypeScript setup

```ts
// src/detect/typescript.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type TsState = "none" | "legacy" | "native-plain" | "aliased";

export function detectTsState(cwd: string): TsState {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const spec: string | undefined = deps.typescript;

  if (
    spec?.startsWith("npm:@typescript/typescript6") &&
    deps["@typescript/native"]
  ) {
    return "aliased";
  }

  const installed = join(cwd, "node_modules", "typescript", "package.json");
  if (existsSync(installed)) {
    const { name, version } = JSON.parse(readFileSync(installed, "utf8"));
    const major = Number(String(version).split(".")[0]);
    if (name === "typescript" && major >= 7) return "native-plain"; // the crash case
    return "legacy";
  }

  return spec ? "legacy" : "none";
}
```

| State                           | Action                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `none`                          | Ask: "Install TypeScript 7 (with TS 6 API alias)?"                                             |
| `legacy` (TS 5/6)               | Ask: "Upgrade to TypeScript 7? Type-aware linting requires it." If declined, skip `typeAware`. |
| `native-plain` (TS 7, no alias) | Ask: "Add TS 6 API alias so SonarJS can load?" If declined, use the fallback in section 6.     |
| `aliased`                       | Do nothing.                                                                                    |

Use `@clack/prompts` `confirm` for every question. Never change `typescript` without asking.

### B2. Detect the package manager

Check lockfiles in this order:

| Lockfile                 | Package manager                  |
| ------------------------ | -------------------------------- |
| `bun.lock` / `bun.lockb` | bun                              |
| `pnpm-lock.yaml`         | pnpm                             |
| `yarn.lock`              | yarn                             |
| `package-lock.json`      | npm                              |
| none of the above        | `packageManager` field, else npm |

### B3. Install dependencies

```ts
const TS_PAIR = [
  "typescript@npm:@typescript/typescript6@^6.0.2",
  "@typescript/native@npm:typescript@^7.0.2",
];
const LINT_DEPS = [
  "oxlint",
  "oxlint-tsgolint",
  "eslint-plugin-sonarjs",
  "oxlint-plugin-complexity", // optional, if the profile uses it
  "@oxlint/plugins", // needed by vendored anti-slop
];

const ADD_DEV: Record<Pm, string[]> = {
  bun: ["bun", "add", "-d"],
  pnpm: ["pnpm", "add", "-D"],
  yarn: ["yarn", "add", "-D"],
  npm: ["npm", "install", "-D"],
};

// spawn with cross-spawn: [...ADD_DEV[pm], ...LINT_DEPS, ...(needsTsPair ? TS_PAIR : [])]
```

If the target has a global `overrides`/`resolutions`/`pnpm.overrides` entry for `typescript`, **warn and stop** before installing. It would override the alias and bring the crash back.

### B4. Post-install sanity checks

Run these in the target; fail with a clear message if either fails:

```bash
node -e "if(typeof require('typescript').TypeFlags!=='object')process.exit(1)"
npx tsc --noEmit   # TS 7; report tsconfig problems and suggest `npx ts5to6`
```

### B5. Generate the SonarJS preset at build time (in the kit)

```ts
// scripts/gen-sonar-preset.ts
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const sonar = require("eslint-plugin-sonarjs");

/** Exist in the plugin but are not registered by oxlint's JS bridge. Naming them breaks config parsing. */
const UNREGISTERED = new Set([
  "async-test-assertions",
  "hooks-before-test-cases",
  "no-duplicate-test-title",
  "no-empty-test-title",
  "no-floating-point-equality",
  "no-forced-browser-interaction",
  "no-trivial-assertions",
  "prefer-specific-assertions",
  "super-linear-regex",
]);

/** Registered but unhelpful under oxlint. */
const ALWAYS_OFF = new Set([
  "no-reference-error", // bridge provides no globals
  "file-header", // errors on every file without config
  "arrow-function-convention", // conflicts with the formatter
  "cognitive-complexity", // set explicitly in the main config
]);

const rules: Record<string, "error" | "off"> = {};
for (const [name, rule] of Object.entries<any>(sonar.rules)) {
  if (UNREGISTERED.has(name)) continue;
  const typeAware = rule.meta?.docs?.requiresTypeChecking === true;
  rules[`sonarjs/${name}`] =
    typeAware || ALWAYS_OFF.has(name) ? "off" : "error";
}

writeFileSync(
  "templates/sonarjs.preset.ts",
  `// generated by scripts/gen-sonar-preset.ts — do not edit\nexport default ${JSON.stringify(
    rules,
    null,
    2
  )} as const;\n`
);
console.log(
  `sonarjs preset: ${
    Object.values(rules).filter((v) => v === "error").length
  } on`
);
```

Add it to `package.json` scripts:

```json
"gen:sonar": "node scripts/gen-sonar-preset.ts",
"prepublishOnly": "bun run check-vendor && bun run gen:sonar && bun run build"
```

⚠️ Before trusting this script, confirm that SonarJS rules actually expose `meta.docs.requiresTypeChecking` (open a few rule files under `node_modules/eslint-plugin-sonarjs`). If they don't, keep a hand-written list of type-aware rules instead.

### B6. `oxlint.config.ts` template

```ts
import { defineConfig } from "oxlint";
import sonarPreset from "./tools/oxlint/sonarjs.preset";

export default defineConfig({
  options: {
    typeAware: true, // tsgolint (TS 7). Root config only.
    typeCheck: true, // optional: replaces `tsc --noEmit` in CI
  },
  plugins: ["typescript", "unicorn", "import", "promise", "oxc"],
  jsPlugins: [
    "eslint-plugin-sonarjs",
    "oxlint-plugin-complexity",
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    // ── Type-aware (tsgolint): replaces SonarJS type-aware coverage ──
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/strict-boolean-expressions": "error",
    "typescript/no-unnecessary-condition": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/restrict-template-expressions": "error",
    "typescript/prefer-nullish-coalescing": "error",
    "typescript/only-throw-error": "error",

    // ── Structure (native) ──
    "eslint/max-depth": ["error", 4],
    "eslint/max-params": ["error", 4],
    "eslint/complexity": ["error", 10],

    // ── SonarJS syntax-only rules (JS bridge) ──
    ...sonarPreset,

    // ── Cognitive complexity: enable ONE ──
    "sonarjs/cognitive-complexity": ["error", 15],
    // "complexity/complexity": ["error", { cognitive: 15 }],
  },
});
```

The CLI copies `templates/sonarjs.preset.ts` into `<target>/tools/oxlint/` next to the vendored anti-slop.

### B7. Target scripts, baseline and editor

Generated scripts:

```json
"lint": "oxlint",
"lint:fix": "oxlint --fix",
"typecheck": "tsc --noEmit"
```

Drop `typecheck` if `typeCheck: true` is set.

- **Baseline:** regenerate the violation baseline after migrating. The new tsgolint rules add new findings, and an old baseline would hide nothing useful.
- **Editor:** tell users to set `typeAware: true` in the Oxc VS Code extension or LSP settings.
- **tsconfig scope:** warn if `include` is `["**/*"]`. tsgolint will type-check build output and get slow. Recommend `["src/**/*"]` plus `exclude: ["dist", "build", "coverage"]`.

---

## 5. Part C — Tests and release

### E2E fixtures (`test/e2e/fixtures/`)

| Fixture                                 | Expectation                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `ts7-plain` (`typescript@^7`, no alias) | CLI offers the alias; after setup, `oxlint` exits without `TypeError`. |
| `ts7-aliased`                           | CLI changes nothing about TS; lint passes.                             |
| `ts5-legacy`                            | Upgrade prompt shown; declining disables `typeAware`.                  |
| `global-ts-override`                    | CLI warns and stops.                                                   |

### Assertions for each fixture

- The oxlint run's stderr contains no `TypeError` and no `Cannot read properties of undefined`.
- A file with `fetch("x");` (unawaited) is reported as `typescript/no-floating-promises`. This proves tsgolint ran.
- A file with two identical functions is reported as `sonarjs/no-identical-functions`. This proves SonarJS loaded.

Run the suite under **bun on Windows**, which is where the crash was reported, plus Linux in CI.

### Release

- This is a **breaking setup change**, because the CLI may rewrite the target's `typescript` dependency. Use a changeset with a major or minor bump.
- Changelog note: "Type-aware linting via oxlint-tsgolint (requires TS 7). TypeScript is installed as a TS 6 API alias + TS 7 compiler so eslint-plugin-sonarjs keeps working."

---

## 6. Fallback: target refuses to alias `typescript`

Opt-in profile only. Install `@typescript/typescript6` as a normal devDependency, copy this wrapper, and point `jsPlugins` at it.

```js
// templates/sonarjs-ts6.cjs → <target>/tools/oxlint/sonarjs-ts6.cjs
"use strict";
// Redirects SonarJS's `require("typescript")` to the TS 6 API package.
// Uses Module._resolveFilename (internal Node API; stable in practice).
const Module = require("node:module");
const path = require("node:path");

const SONAR_DIR = `${path.sep}eslint-plugin-sonarjs${path.sep}`;
const original = Module._resolveFilename;

Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "typescript" && parent?.filename?.includes(SONAR_DIR)) {
    request = "@typescript/typescript6";
  }
  return original.call(this, request, parent, ...rest);
};

module.exports = require("eslint-plugin-sonarjs"); // force CJS build
```

```ts
jsPlugins: [{ name: "sonarjs", specifier: "./tools/oxlint/sonarjs-ts6.cjs" }],
```

---

## 7. Verify before merging

- [ ] `@typescript/typescript6` exposes `TypeFlags` via `require("typescript")` when aliased (A2 check).
- [ ] `meta.docs.requiresTypeChecking` exists on SonarJS rules (B5).
- [ ] `tsup` emits `.d.ts` with the alias in place.
- [ ] Bun on Windows resolves `typescript@npm:@typescript/typescript6` correctly in the target.
- [ ] The current Oxlint docs still list the same 9 unregistered SonarJS rules (this may shrink over time).
- [ ] tsgolint rule names in B6 all exist in the current tsgolint release.

## 8. Things to watch upstream

- **oxc-project/oxc#19596:** type information for JS plugins. If it lands, SonarJS's type-aware rules could be re-enabled.
- **SonarJS widening its `typescript` range** or shipping a TS 7 analyzer: the alias would no longer be needed for SonarJS.
- **`ubugeeei-prod/oxlint-plugins`:** a native Rust port of SonarJS. Licensing with Sonar was not yet settled as of mid-2026.
- **`corsa-oxlint`:** type-aware Oxlint JS plugins built on TS 7. Still early WIP.

## 9. References

- Oxlint type-aware linting: https://oxc.rs/docs/guide/usage/linter/type-aware
- Oxlint JS plugins: https://oxc.rs/docs/guide/usage/linter/js-plugins
- TS 7 beta announcement (`@typescript/typescript6`): https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/
- Nx TS 7 side-by-side guide: https://nx.dev/docs/technologies/typescript/guides/typescript-7
- SonarJS TS range cap (context): https://github.com/maicol07/eslint-config/issues/4
- Oxlint JS plugin compatibility thread: https://github.com/oxc-project/oxc/discussions/20245
- Ultracite oxlint changelog (unregistered SonarJS rules): https://www.ultracite.ai/changelog/ultracite-7-9-1
- oxlint-tsgolint: https://www.npmjs.com/package/oxlint-tsgolint
