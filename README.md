# ITSKAZU-OXLINT-RULES-KIT-TS

Profile-based Oxlint setup. One command generates layered presets (base, framework,
sonarjs, vendored anti-slop, strict), a thin `oxlint.config.ts`, package scripts,
Prettier wiring and an optional violation baseline for CI.

## Use

    npx @kiranaide/oxlint-kit init      # interactive wizard in a terminal
    npx @kiranaide/oxlint-kit update    # tested versions + bundled anti-slop, shows a diff first
    npx @kiranaide/oxlint-kit doctor    # read-only diagnosis

Requires Node 22.18+.

### Profiles

`react-ts`, `next`, `ts`, `node` are stable. `vue` and `svelte` are experimental:
Oxlint only partly supports those files and JS-plugin rules may not run on them.
Without `--profile`, the profile is detected from your dependencies.

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

## Develop

    bun install
    bun sync-anti-slop          # populate vendor/ (commit it)
    bun test                    # first run writes snapshots; commit them
    bun build
    node dist/cli.js init --dry-run --cwd ../some-project
    E2E_PM=bun bun test:e2e

Bumping tested versions: edit `src/compat.ts`, run the E2E suite, add a changeset.
Bumping anti-slop: `bun sync-anti-slop --head` (or `--sha <sha>`), review `git diff vendor/`.

## Release

Changesets + GitHub Actions. Add an `NPM_TOKEN` secret (or configure npm trusted
publishing), merge the "Version Packages" PR, and the workflow publishes with provenance.
