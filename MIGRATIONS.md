# TypeScript 7 + type-aware linting in `@kiranaide/oxlint-kit`

Status: **implemented** (see `.changeset/ts7-type-aware.md`) · Updated: 2026-11-17

## 1. Background

TypeScript 7 (stable since July 2026) is a native Go compiler published as the normal
`typescript` package. It ships **no JavaScript compiler API**: no `lib/typescript.js`,
no `TypeFlags`.

`eslint-plugin-sonarjs` 4.2.x reads `TypeFlags` at module load, so the whole plugin
crashes before any rule runs on TS 7:

```
node_modules\eslint-plugin-sonarjs\cjs\helpers\type.js:202
const NOTHING_TYPE_FLAGS = typescript_1.default.TypeFlags.Void | ...
TypeError: Cannot read properties of undefined (reading 'Void')
```

SonarJS declares `typescript: ">=5 <6.1.0"` and its TS 7 analyzer work was closed
without merging. Oxlint (checked against 1.94.0) has **no native sonarjs rules**; a
Rust port is only being discussed with SonarSource.

## 2. Decision (2026-11-17)

Drop `eslint-plugin-sonarjs` entirely instead of working around its TS 7 crash.
An earlier implementation used a `@typescript/typescript6` alias pair plus a
`Module._resolveFilename` shim; both were removed because they rewrite or redirect the
user's `typescript` dependency and add a fragile resolution hack.

1. The **sonar preset is native Oxlint rules** that mirror SonarJS's syntax-only bug
   checks (`eslint/no-dupe-else-if`, `no-self-compare`, `no-constant-binary-expression`,
   `no-extra-boolean-cast`, `no-negated-condition`, `no-useless-return`, plus further
   native correctness rules). Every name is verified against the tested oxlint release;
   the post-install smoke test proves the preset reports.
2. **Type-aware linting** runs through `oxlint-tsgolint`, which bundles its own
   typescript-go compiler: it works on TS 5/6/7/none and never touches the project's
   `typescript` dependency.
3. Sonar checks with no native equivalent are dropped, not emulated:
   `no-identical-functions`, `no-hardcoded-passwords`, `no-hardcoded-secrets`,
   `no-clear-text-protocols`, `no-collapsible-if`, `prefer-single-boolean-return`,
   `no-nested-template-literals`, `cognitive-complexity` (base keeps `eslint/complexity`).
4. The kit repo itself uses plain `typescript@7` (`tsc --noEmit` works; tsup is
   esbuild-based and emits no `.d.ts`, so no TS JS API is needed anywhere).

## 3. What was removed

- `src/env/typescript.ts` (TS state detection, override guard, `TypeFlags` probe)
- `src/core/tsdecision.ts` (alias-pair / shim / blocked decision flow)
- `templates/sonarjs-ts6.cjs` (resolution shim) and its staging/apply path
- `scripts/gen-sonar-preset.ts` + `src/rules/sonar.generated.ts` (plugin inventory)
- `eslint-plugin-sonarjs` and the `eslint` peer fallback from `COMPAT`/dep planning
- `tsResolution` from the install record; alias/shim checks from `doctor`

## 4. Verify before merging

- [x] `bun run typecheck` on plain typescript@7
- [x] `bun run test` (unit, snapshots regenerated)
- [x] `bun run build` (tsup, no dts)
- [ ] `E2E_PM=bun bun run test:e2e` — init/doctor/update on ts7-plain, ts5-legacy,
      no-typescript; sonar preset reports `eslint(no-self-compare)`; type-aware reports
      `typescript(no-floating-promises)`; `typescript` dep untouched.

## 5. Things to watch upstream

- **Native sonarjs port for Oxlint** (SonarSource licensing discussion, mid-2026):
  if it lands, the sonar preset can move to real `sonarjs/*` rules.
- **oxc-project/oxc#19596** (type information for JS plugins): would let JS-plugin
  rules do type-aware checks without tsgolint.
- **SonarJS widening its `typescript` range** or shipping a TS 7 analyzer: the plugin
  could be reconsidered, but the native preset has no runtime cost and no TS coupling.

## 6. References

- Oxlint type-aware linting: https://oxc.rs/docs/guide/usage/linter/type-aware
- Oxlint JS plugins: https://oxc.rs/docs/guide/usage/linter/js-plugins
- SonarJS Rust-port licensing thread: https://community.sonarsource.com/t/would-sonarsource-permit-a-rust-implementation-of-eslint-plugin-sonarjs-for-oxc/183564
- oxc sonarjs discussion: https://github.com/oxc-project/oxc/discussions/4863
- oxlint-tsgolint: https://www.npmjs.com/package/oxlint-tsgolint