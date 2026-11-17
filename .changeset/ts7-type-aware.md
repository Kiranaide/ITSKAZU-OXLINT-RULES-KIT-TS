---
"@kiranaide/oxlint-kit": major
---

Type-aware linting via oxlint-tsgolint, and TypeScript 7 compatibility for the sonar preset.

- New type-aware `typescript/*` rules in the base preset (`await-thenable`, `only-throw-error` hard; `no-unnecessary-type-assertion`, `restrict-template-expressions`, `strict-boolean-expressions`, `switch-exhaustiveness-check` soft). They run under `lint:strict` / `check`; plain `oxlint` stays fast.
- The sonar preset now covers the full syntax-only eslint-plugin-sonarjs rule set (generated from the plugin at build time) instead of a hand-picked list. New rules default to warn in `adopt` mode; the baseline absorbs them.
- `sonarjs/no-small-switch` is no longer enabled: it is type-aware and cannot work through Oxlint's JS bridge.
- On projects with plain `typescript@7` (no JS compiler API), the CLI asks before installing the `typescript@npm:@typescript/typescript6` + `@typescript/native` alias pair. Declining (or non-interactive runs) writes a resolution shim (`tools/oxlint/sonarjs-ts6.cjs`) instead — `typescript` itself is only ever changed after an explicit yes.
- Projects with `overrides`/`resolutions`/`pnpm.overrides` pinning `typescript` are refused before anything is installed (the pin defeats the alias and brings the SonarJS crash back).
- `doctor` reports the TypeScript state (plain 7 / alias / legacy) and override traps.
