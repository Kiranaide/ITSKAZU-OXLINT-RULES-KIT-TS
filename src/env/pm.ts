import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "./fs";

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const isPackageManager = (value: unknown): value is PackageManager =>
  typeof value === "string" && (PACKAGE_MANAGERS as readonly string[]).includes(value);

const LOCKFILES: ReadonlyArray<readonly [PackageManager, readonly string[]]> = [
  ["bun", ["bun.lock", "bun.lockb"]],
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["npm", ["package-lock.json"]],
];

export function detectPackageManager(root: string): PackageManager {
  for (const [pm, files] of LOCKFILES) {
    if (files.some((file) => existsSync(join(root, file)))) return pm;
  }
  const declared = readJson<{ packageManager?: string }>(join(root, "package.json"))?.packageManager?.split("@")[0];
  return isPackageManager(declared) ? declared : "npm";
}

export function addDevCommand(pm: PackageManager, specs: string[]): [string, string[]] {
  switch (pm) {
    case "bun":
      return ["bun", ["add", "-d", "--exact", ...specs]];
    case "pnpm":
      return ["pnpm", ["add", "-D", "--save-exact", ...specs]];
    case "yarn":
      return ["yarn", ["add", "-D", "--exact", ...specs]];
    default:
      return ["npm", ["install", "-D", "--save-exact", ...specs]];
  }
}

export function execCommand(pm: PackageManager, args: string[]): [string, string[]] {
  switch (pm) {
    case "bun":
      return ["bunx", args];
    case "pnpm":
      return ["pnpm", ["exec", ...args]];
    case "yarn":
      return ["yarn", args];
    default:
      return ["npx", ["--no-install", ...args]];
  }
}

export const runScriptPrefix = (pm: PackageManager): string => (pm === "npm" || pm === "bun" ? `${pm} run` : pm);
