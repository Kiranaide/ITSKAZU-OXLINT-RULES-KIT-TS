import { join } from "node:path";

export function projectPaths(root: string) {
  const oxlintDir = join(root, "tools", "oxlint");
  return {
    root,
    pkg: join(root, "package.json"),
    config: join(root, "oxlint.config.ts"),
    prettierignore: join(root, ".prettierignore"),
    oxlintDir,
    vendored: join(oxlintDir, "anti-slop"),
    presets: join(oxlintDir, "presets"),
    state: join(oxlintDir, "oxlint-kit.json"),
    legacyLock: join(oxlintDir, "anti-slop.lock.json"),
    baselineScript: join(oxlintDir, "baseline-check.mjs"),
    baseline: join(oxlintDir, "baseline.json"),
    // Not dot-folders: Oxlint must lint the smoke fixture inside them.
    staging: join(root, "oxlint-kit-staging"),
    doctorDir: join(root, "oxlint-kit-doctor"),
    backups: join(root, ".oxlint-kit-backup"),
  };
}

export type ProjectPaths = ReturnType<typeof projectPaths>;
