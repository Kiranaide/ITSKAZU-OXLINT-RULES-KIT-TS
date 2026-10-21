import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ProjectPaths } from "./paths";

/** For projects outside git: copies every file the install may change. */
export function backupFiles(paths: ProjectPaths): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(paths.backups, stamp);
  for (const file of [paths.pkg, paths.config, paths.prettierignore, paths.oxlintDir]) {
    if (!existsSync(file)) continue;
    const target = join(dest, relative(paths.root, file));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(file, target, { recursive: true });
  }
  return relative(paths.root, dest);
}
