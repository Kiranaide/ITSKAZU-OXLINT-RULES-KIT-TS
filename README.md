# ITSKAZU-OXLINT-RULES-KIT-TS

Profile-based Oxlint setup. One command generates layered presets (base, framework,
sonar, vendored anti-slop + kira, strict), a thin `oxlint.config.ts`, package scripts,
Prettier wiring and an optional violation baseline for CI.

## Use

    npx @kiranaide/oxlint-kit init      # interactive wizard in a terminal
    npx @kiranaide/oxlint-kit update    # tested versions + bundled vendored rules, shows a diff first
    npx @kiranaide/oxlint-kit doctor    # read-only diagnosis

Requires Node 22.18+.

### Profiles

`react-ts`, `next`, `ts`, `node` are stable. `vue` and `svelte` are experimental:
Oxlint only partly supports those files and JS-plugin rules may not run on them.
Without `--profile`, the profile is detected from your dependencies.

### Vendored plugins

The `anti-slop` preset loads two vendored JS plugins through `jsPlugins`:
`anti-slop` (upstream dmmulroy/anti-slop, synced by `bun run sync-anti-slop`) and
`kira` — five comment/test-hygiene rules ported from Kiranaide/t3-kira without the
`effect` dependency: `require-suppression-reason`, `no-low-value-comments`,
`no-test-in-loop`, `no-wall-clock-in-tests`, `no-test-timeout-or-unreasoned-skip`.
Kira rules are soft (warn in adopt, error in strict); the test rules only run on
`*.test.*` / `*.spec.*` files. Both copies are hash-checked, and
`tools/oxlint/package.json` scopes them to ESM. Projects with `"type": "commonjs"`
must rename `oxlint.config.ts` to `oxlint.config.mts` (doctor warns).

### Common flags

- `--profile <id>` and `--mode adopt|strict` (adopt: style/complexity rules warn)
- `--no-prettier`, `--baseline`, `--no-smoke`, `--dry-run`, `--pm npm|pnpm|yarn|bun`
- `--allow-dirty` (skip the clean-git-tree guard), `--force` (replace an edited anti-slop copy)
- `--json` (one JSON document on stdout), `--quiet`, `--verbose`, `--yes`, `--cwd <dir>`
- `update --latest` installs the newest published versions instead of the tested set

Colors follow `NO_COLOR` and terminal detection.

### Baseline

With `--baseline`, `tools/oxlint/baseline-check.mjs` and two scripts are added:
`lint:baseline` records current violations per file and rule, and `lint:ci` fails only
when a file/rule pair gets worse.

### Migrating from install-lint.mjs

Run `init` or `update` in the project. A clean legacy install (lockfile hash matches) is
adopted automatically; its profile and mode are read from the generated preset headers.

### TypeScript 7 and type-aware linting

`lint:strict` and `check` run Oxlint's type-aware rules through `oxlint-tsgolint`, which
bundles its own compiler: they work on TypeScript 5, 6 and 7 alike. Your `typescript`
dependency is never modified.

The `sonar` preset is built from native Oxlint rules that mirror SonarJS's syntax-only
bug checks. `eslint-plugin-sonarjs` is not installed: it crashes on TypeScript 7 (the
native compiler ships no JavaScript API), and Oxlint has no native sonarjs port yet.
Sonar checks without a native equivalent (e.g. `no-identical-functions`,
`no-hardcoded-passwords`, `no-clear-text-protocols`) are not covered; `eslint/complexity`
in the base preset still caps complexity.

In the editor, set `typeAware: true` in the Oxc VS Code extension settings to match
`lint:strict`.

## Develop

    bun install
    bun run sync-anti-slop      # populate vendor/ (commit it)
    bun run test                # first run writes snapshots; commit them
    bun run build
    node dist/cli.js init --dry-run --cwd ../some-project
    E2E_PM=bun bun run test:e2e

Bumping tested versions: edit `src/compat.ts`, run the E2E suite, add a changeset.
Bumping anti-slop: `bun run sync-anti-slop --head` (or `--sha <sha>`), review `git diff vendor/`.
Editing the kira port: review the diff, `node scripts/sync-anti-slop.ts --rehash-kira`,
update `vendor/kira/UPSTREAM.md`, add a changeset.

## Release

Changesets + GitHub Actions (bun). Add an `NPM_TOKEN` secret, merge the
"Version Packages" PR, and the workflow publishes to npm.
