import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walks up from this module (src/ in dev, dist/ when built) to the package root. */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not locate the oxlint-kit package root.");
    dir = parent;
  }
  return dir;
}

export const PACKAGE_ROOT = findPackageRoot();

const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { name: string; version: string };

export const PKG_NAME = pkg.name;
export const PKG_VERSION = pkg.version;
export const BIN_NAME = "oxlint-kit";

export const VENDOR_DIR = join(PACKAGE_ROOT, "vendor", "anti-slop");
export const VENDOR_LOCK = join(PACKAGE_ROOT, "vendor", "anti-slop.lock.json");
export const BASELINE_TEMPLATE = join(PACKAGE_ROOT, "templates", "baseline-check.mjs");
