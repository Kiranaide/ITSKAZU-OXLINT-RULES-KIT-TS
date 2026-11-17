# kira provenance

Curated port of selected rules from `oxlint-plugin-t3code` in
https://github.com/Kiranaide/t3-kira (branch `kira`), commit
`6afecdc4d67eb891a61dd1cecf38184eb1935184`, path `oxlint-plugin-t3code/rules`.
Ported 2026-11-17 for @kiranaide/oxlint-kit 1.0.0. Plugin renamed `t3code` → `kira`.

This is NOT a pristine upstream copy. `vendor/anti-slop` stays upstream-owned for
`sync-anti-slop`; kira is a reviewed fork subset maintained here. `vendor/kira.lock.json`
records the source commit and the content hash of this port (integrity only — rehash with
`node scripts/sync-anti-slop.ts --rehash-kira` after reviewed edits).

## Adopted rules (all soft: warn in adopt, error in strict)

- `require-suppression-reason` — verbatim.
- `no-low-value-comments` — removed the T3 `@public` service-boilerplate pattern.
- `no-test-in-loop` — effect/Option ported to plain TS; description generalized.
- `no-wall-clock-in-tests` — effect/Option ported; message no longer pushes Effect TestClock.
- `no-test-timeout-or-unreasoned-skip` — effect/Option ported; the quarantine comment accepts
  any issue reference (`#123` or a GitHub issue URL), not only `quarantine: #123`; the
  `*.live.test.*` exemption is kept as the slow-suite escape hatch.

## Local deviations

- `utils.ts` rewritten without the `effect` dependency (Option → `T | undefined`).
- Rules load through `definePlugin`/`defineRule` from `@oxlint/plugins` (same as upstream).
- Not adopted: React-Compiler-policy rules (`no-manual-memo`, `no-hookless-use-function`,
  `no-unreasoned-state-sync`), Effect-centric test rules (`no-polling-loop-in-tests`,
  `no-real-time-wait-in-tests`), T3 app conventions (`no-dom-test-environment`,
  `no-raw-resize-observer`, `namespace-node-imports`) and the ~20 app-specific rules.

## Updating

Re-port by hand (there is no sync script for kira): fetch the new revision, diff against
this tree, keep the local deviations above, update the lock `sha`, rehash, record the
changes here and add a changeset.