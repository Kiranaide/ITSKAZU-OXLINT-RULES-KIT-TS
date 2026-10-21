import { existsSync } from "node:fs";
import { join } from "node:path";
import { fail } from "../errors";
import { readJson } from "./fs";
import { gitStatus } from "./git";
import { detectPackageManager, type PackageManager } from "./pm";
import { readTsStrict } from "./tsconfig";
import { detectWorkspace, type WorkspaceInfo } from "./workspace";

export interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
  prettier?: unknown;
  [key: string]: unknown;
}

export interface Environment {
  root: string;
  pm: PackageManager;
  pkg: PackageJson;
  isRepo: boolean;
  dirty: string[];
  hasTsconfig: boolean;
  tsStrict: boolean | null;
  eslintConfigs: string[];
  biomeConfigs: string[];
  hasPrettierConfig: boolean;
  workspace: WorkspaceInfo;
}

const ESLINT_CONFIGS = [
  "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts",
  ".eslintrc", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml",
];
const PRETTIER_CONFIGS = [
  ".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.js",
  ".prettierrc.mjs", "prettier.config.js", "prettier.config.mjs", "prettier.config.ts",
];

export function detectEnvironment(root: string, pmOverride?: PackageManager): Environment {
  const pkg = readJson<PackageJson>(join(root, "package.json"));
  if (!pkg) fail(`No readable package.json in ${root}. Run this from your project root (or pass --cwd).`);

  const present = (files: string[]) => files.filter((file) => existsSync(join(root, file)));
  const git = gitStatus(root);
  const tsconfig = join(root, "tsconfig.json");

  return {
    root,
    pm: pmOverride ?? detectPackageManager(root),
    pkg,
    isRepo: git.isRepo,
    dirty: git.dirty,
    hasTsconfig: existsSync(tsconfig),
    tsStrict: readTsStrict(tsconfig),
    eslintConfigs: present(ESLINT_CONFIGS),
    biomeConfigs: present(["biome.json", "biome.jsonc"]),
    hasPrettierConfig: Boolean(pkg.prettier) || present(PRETTIER_CONFIGS).length > 0,
    workspace: detectWorkspace(root),
  };
}
