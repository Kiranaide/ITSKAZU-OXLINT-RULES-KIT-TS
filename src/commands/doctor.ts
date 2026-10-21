import { defineCommand } from "citty";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { COMPAT, MIN_NODE, type CompatName } from "../compat";
import { projectPaths } from "../core/paths";
import { runSmoke } from "../core/smoke";
import { installedSettings, vendoredOwnership } from "../core/state";
import { detectEnvironment } from "../env/detect";
import { installedVersion } from "../env/fs";
import type { PackageManager } from "../env/pm";
import { PROFILES } from "../profiles";
import { configImportsMatch, configReferencesPresets } from "../render/config";
import { presetBody, renderPreset } from "../render/preset";
import { commonArgs, parsePm, runCommand } from "./shared";

type Status = "ok" | "warn" | "fail";
interface Check {
  name: string;
  status: Status;
  detail: string;
}

const ICON: Record<Status, string> = { ok: pc.green("✓"), warn: pc.yellow("⚠"), fail: pc.red("✗") };

function diagnose(root: string, pmOverride: PackageManager | undefined, smoke: boolean): Check[] {
  const checks: Check[] = [];
  const add = (name: string, status: Status, detail: string) => checks.push({ name, status, detail });
  const env = detectEnvironment(root, pmOverride);
  const paths = projectPaths(root);

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const nodeOk = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  add("node", nodeOk ? "ok" : "fail", `${process.versions.node} (need ${MIN_NODE.join(".")}+)`);
  add("package manager", "ok", env.pm);

  if (!env.hasTsconfig) add("tsconfig", "warn", "missing: type-aware rules need it");
  else add("tsconfig", env.tsStrict ? "ok" : "warn", env.tsStrict ? '"strict": true' : 'could not confirm "strict": true');

  const required: Record<CompatName, Status> = {
    oxlint: "fail",
    "oxlint-tsgolint": "warn",
    "eslint-plugin-sonarjs": "fail",
    prettier: "warn",
    eslint: "ok",
  };
  for (const name of ["oxlint", "oxlint-tsgolint", "eslint-plugin-sonarjs", "prettier"] as const) {
    const have = installedVersion(root, name);
    if (!have) add(name, required[name], "not installed");
    else if (have === COMPAT[name]) add(name, "ok", have);
    else add(name, "warn", `${have} (tested: ${COMPAT[name]}; \`update\` aligns it)`);
  }

  const oxlint = installedVersion(root, "oxlint");
  const plugins = installedVersion(root, "@oxlint/plugins");
  if (oxlint) {
    if (!plugins) add("@oxlint/plugins", "fail", "not installed");
    else add("@oxlint/plugins", plugins === oxlint ? "ok" : "fail", plugins === oxlint ? plugins : `${plugins} does not match oxlint ${oxlint}`);
  }

  const settings = installedSettings(paths);
  if (!settings) add("install record", "fail", "no setup found; run init");
  else if (settings.source === "legacy") add("install record", "warn", `${settings.profile}, ${settings.mode} from install-lint.mjs; run update to migrate`);
  else add("install record", "ok", `${settings.profile}, ${settings.mode} (written by ${settings.version ?? "unknown"})`);

  const ownership = vendoredOwnership(paths);
  const ownershipCheck: Record<typeof ownership, [Status, string]> = {
    none: ["fail", "tools/oxlint/anti-slop is missing"],
    managed: ["ok", "matches the install record"],
    legacy: ["warn", "matches the legacy lockfile; run update to migrate"],
    edited: ["fail", "edited locally (hash mismatch); update --force restores it"],
    unknown: ["warn", "no install record to verify against"],
  };
  add("anti-slop", ...ownershipCheck[ownership]);

  if (settings) {
    const profile = PROFILES[settings.profile];
    const stale = profile.presets.filter((preset) => {
      const file = join(paths.presets, `${preset}.ts`);
      return !existsSync(file) || presetBody(readFileSync(file, "utf8")) !== presetBody(renderPreset(preset, profile, settings.mode));
    });
    add("presets", stale.length ? "warn" : "ok", stale.length ? `differ from this CLI version: ${stale.join(", ")} (run update)` : "match this CLI version");

    if (!existsSync(paths.config)) add("oxlint.config.ts", "fail", "missing");
    else {
      const text = readFileSync(paths.config, "utf8");
      if (!configReferencesPresets(text)) add("oxlint.config.ts", "warn", "does not extend the generated presets");
      else if (!configImportsMatch(text, profile)) add("oxlint.config.ts", "fail", `imports do not match the "${profile.id}" presets`);
      else add("oxlint.config.ts", "ok", "extends the generated presets");
    }
  }

  if (env.eslintConfigs.length) add("eslint", "warn", `config present (${env.eslintConfigs.join(", ")}): duplicate reports`);
  if (env.biomeConfigs.length) add("biome", "warn", `config present (${env.biomeConfigs.join(", ")}): overlaps Oxlint`);

  if (smoke && oxlint && existsSync(paths.config)) {
    try {
      const result = runSmoke(root, env.pm, paths.config, paths.doctorDir);
      add("plugins load", result.ok ? "ok" : "fail", result.ok ? "sonarjs and anti-slop report on a fixture" : `missing: ${result.missing.join(", ")} (check overrides in oxlint.config.ts)`);
    } finally {
      rmSync(paths.doctorDir, { recursive: true, force: true });
    }
  }
  return checks;
}

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "Diagnose the Oxlint setup without changing anything" },
  args: {
    ...commonArgs,
    smoke: { type: "boolean", default: true, description: "Check that plugins load with the real config", negativeDescription: "Skip the plugin load check" },
  },
  async run({ args }) {
    await runCommand(args, async ({ root, log }) => {
      const checks = diagnose(root, parsePm(args.pm), args.smoke !== false);
      const failed = checks.some((c) => c.status === "fail");
      if (log.json) log.result({ ok: !failed, checks });
      else for (const c of checks) log.raw(`${ICON[c.status]} ${c.name.padEnd(22)} ${c.detail}`);
      return failed ? 1 : 0;
    });
  },
});
