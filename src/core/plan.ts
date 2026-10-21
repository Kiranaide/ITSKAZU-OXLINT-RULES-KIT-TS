import { COMPAT, type CompatName } from "../compat";
import { execOrFail } from "../env/exec";
import { installedVersion } from "../env/fs";
import type { Profile } from "../profiles";

/** keep: respect installed versions (init). compat: move to the tested set (update). latest: newest published. */
export type DepStrategy = "keep" | "compat" | "latest";

export interface DepPlan {
  toInstall: { name: string; version: string }[];
  kept: string[];
  warnings: string[];
}

const npmLatest = (name: string, root: string): string => execOrFail("npm", ["view", name, "version"], { cwd: root }).trim();

export function planDependencies(root: string, profile: Profile, prettier: boolean, strategy: DepStrategy): DepPlan {
  const plan: DepPlan = { toInstall: [], kept: [], warnings: [] };

  const decide = (name: CompatName): string => {
    const have = installedVersion(root, name);
    const want = strategy === "latest" ? npmLatest(name, root) : COMPAT[name];
    if (have && (strategy === "keep" || have === want)) {
      plan.kept.push(`${name}@${have}`);
      if (have !== want) {
        plan.warnings.push(`${name}@${have} is installed; the tested version is ${want}. Keeping yours (\`update\` moves it); the smoke test checks that it works.`);
      }
      return have;
    }
    plan.toInstall.push({ name, version: want });
    return want;
  };

  const oxlint = decide("oxlint");
  const pluginsHave = installedVersion(root, "@oxlint/plugins");
  if (pluginsHave === oxlint) {
    plan.kept.push(`@oxlint/plugins@${pluginsHave}`);
  } else {
    plan.toInstall.push({ name: "@oxlint/plugins", version: oxlint });
    if (pluginsHave) plan.warnings.push(`@oxlint/plugins@${pluginsHave} does not match oxlint@${oxlint}; aligning it.`);
  }

  decide("oxlint-tsgolint");
  if (profile.presets.includes("sonar")) decide("eslint-plugin-sonarjs");
  if (prettier) decide("prettier");
  return plan;
}

export function desiredScripts(options: { prettier: boolean; baseline: boolean }): Record<string, string> {
  const scripts: Record<string, string> = {
    lint: "oxlint",
    "lint:fix": "oxlint --fix",
    "lint:strict": "oxlint --type-aware",
    typecheck: "tsc --noEmit",
    check: `oxlint --type-aware && tsc --noEmit${options.prettier ? " && prettier --check ." : ""}`,
  };
  if (options.prettier) {
    scripts.format = "prettier --write .";
    scripts["format:check"] = "prettier --check .";
  }
  if (options.baseline) {
    scripts["lint:ci"] = "node tools/oxlint/baseline-check.mjs --type-aware";
    scripts["lint:baseline"] = "node tools/oxlint/baseline-check.mjs --update --type-aware";
  }
  return scripts;
}

export interface ScriptPlan {
  add: [string, string][];
  keep: string[];
}

export function planScripts(existing: Record<string, string> | undefined, options: { prettier: boolean; baseline: boolean }): ScriptPlan {
  const wanted = desiredScripts(options);
  return {
    add: Object.entries(wanted).filter(([name]) => !existing?.[name]),
    keep: Object.keys(wanted).filter((name) => existing?.[name]),
  };
}

/** Adds scripts to raw package.json text, keeping its indentation. */
export function withScripts(raw: string, add: ReadonlyArray<readonly [string, string]>): string {
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? "  ";
  const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
  pkg.scripts ??= {};
  for (const [name, command] of add) pkg.scripts[name] = command;
  return `${JSON.stringify(pkg, null, indent)}\n`;
}
