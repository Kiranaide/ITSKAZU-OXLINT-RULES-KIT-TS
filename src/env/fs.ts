import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readJson<T = unknown>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Finds node_modules/<name> from root upward, so hoisted installs are found too. */
export function findPackageDir(root: string, name: string): string | null {
  let dir = root;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function installedVersion(root: string, name: string): string | null {
  const dir = findPackageDir(root, name);
  if (!dir) return null;
  return readJson<{ version?: string }>(join(dir, "package.json"))?.version ?? null;
}
