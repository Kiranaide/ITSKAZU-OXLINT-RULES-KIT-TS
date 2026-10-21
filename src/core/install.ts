import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPAT } from "../compat";
import { detectEnvironment, type Environment } from "../env/detect";
import { exec } from "../env/exec";
import { findPackageDir } from "../env/fs";
import { addDevCommand, type PackageManager } from "../env/pm";
import { fail } from "../errors";
import { BASELINE_TEMPLATE, PKG_NAME, PKG_VERSION } from "../meta";
import type { Profile, ProfileId } from "../profiles";
import { configImportsMatch, configReferencesPresets, configSnippet, renderConfig } from "../render/config";
import { renderPreset } from "../render/preset";
import { renderPrettierIgnore } from "../render/prettierignore";
import type { Mode } from "../rules";
import type { Logger } from "../ui/logger";
import { lastLines } from "../util";
import { backupFiles } from "./backup";
import { diffDirs, type DirDiff } from "./diff";
import { PROVENANCE_FILE } from "./hash";
import { projectPaths, type ProjectPaths } from "./paths";
import { planDependencies, planScripts, withScripts, type DepPlan, type DepStrategy, type ScriptPlan } from "./plan";
import { runSmoke } from "./smoke";
import { vendoredOwnership, type InstallState, type Ownership } from "./state";
import { collectViolations, type ViolationSummary } from "./summary";
import { Transaction } from "./transaction";
import { loadBundledAntiSlop, provenance } from "./vendor";

export interface PendingChanges {
  presets: DirDiff;
  antiSlop: DirDiff;
  deps: DepPlan;
}

export interface InstallOptions {
  root: string;
  pm?: PackageManager;
  profile: Profile;
  mode: Mode;
  prettier: boolean;
  baseline: boolean;
  smoke: boolean;
  deps: DepStrategy;
  dryRun: boolean;
  allowDirty: boolean;
  force: boolean;
  /** Called after the plan is printed; returning false stops before any change. */
  confirmPlan?: () => Promise<boolean>;
  /** Called with the staged diff before dependencies are touched (used by `update`). */
  confirmChanges?: (changes: PendingChanges) => Promise<boolean>;
}

export interface InstallResult {
  dryRun: boolean;
  profile: ProfileId;
  mode: Mode;
  packageManager: PackageManager;
  settings: { prettier: boolean; baseline: boolean };
  antiSlop: { sha: string; ownership: Ownership };
  dependencies: { install: string[]; keep: string[] };
  scripts: { add: string[]; keep: string[] };
  notes: string[];
  changed: string[];
  backupDir: string | null;
  smoke: "passed" | "skipped" | null;
  baseline: "recorded" | "failed" | "kept" | null;
  violations: ViolationSummary | null;
  configSnippet: string | null;
}

interface NoteInput {
  env: Environment;
  profile: Profile;
  deps: DepPlan;
  scripts: ScriptPlan;
  configExists: boolean;
  configIsOurs: boolean;
  configMatches: boolean;
  ownership: Ownership;
}

function collectNotes({ env, profile, deps, scripts, configExists, configIsOurs, configMatches, ownership }: NoteInput): string[] {
  const notes = [...deps.warnings];
  if (!env.hasTsconfig) notes.push("No tsconfig.json found: type-aware rules (`lint:strict`) need one.");
  else if (!env.tsStrict) notes.push('Could not confirm `"strict": true` in tsconfig.json (extends is not followed); the no-unsafe-* rules are noisy without it.');
  if (env.eslintConfigs.length) {
    notes.push(`ESLint config found (${env.eslintConfigs.join(", ")}). Not touched. Running both linters duplicates reports; see \`npx @oxlint/migrate\`.`);
  }
  if (env.biomeConfigs.length) notes.push(`Biome config found (${env.biomeConfigs.join(", ")}). Not touched; it overlaps Oxlint and Prettier.`);
  if (scripts.keep.length) notes.push(`Existing scripts kept: ${scripts.keep.join(", ")}.`);
  if (configExists && !configIsOurs) {
    notes.push("oxlint.config.ts exists and does not extend the generated presets. Not touched; see the snippet at the end.");
  } else if (configIsOurs && !configMatches) {
    notes.push(`oxlint.config.ts imports presets that do not match the "${profile.id}" profile. Not touched; update its imports from the snippet at the end.`);
  }
  if (profile.experimental) {
    notes.push(`The "${profile.id}" profile is experimental: Oxlint only partly supports these files, and JS-plugin rules (sonarjs, anti-slop) may not run on them.`);
  }
  if (env.workspace.isWorkspaceRoot) notes.push("Monorepo detected. v1 installs at the root only; per-package profiles are not supported yet.");
  if (env.workspace.parentRoot) notes.push(`This folder is inside a workspace (${env.workspace.parentRoot}). v1 is meant to run at the workspace root.`);
  if (ownership === "legacy") notes.push("Found a setup created by install-lint.mjs. It will be adopted: presets regenerated, lockfile migrated to oxlint-kit.json.");
  return notes;
}

function addDeps(env: Environment, specs: string[], log: Logger): void {
  const [cmd, args] = addDevCommand(env.pm, specs);
  log.step(`$ ${cmd} ${args.join(" ")}`);
  const result = exec(cmd, args, { cwd: env.root, inherit: !log.json && !log.quiet });
  if (result.status !== 0) fail(`\`${cmd} ${args.join(" ")}\` failed (exit ${result.status}).\n${lastLines(result.stderr || result.stdout, 15)}`);
}

function smokeGate(env: Environment, paths: ProjectPaths, profile: Profile, stagedConfig: string, log: Logger, changed: string[]): void {
  log.step("Smoke test: loading staged presets and running sonarjs + anti-slop rules...");
  let smoke = runSmoke(env.root, env.pm, stagedConfig, paths.staging);
  if (!smoke.ok && profile.presets.includes("sonar") && !findPackageDir(env.root, "eslint")) {
    log.warn("Plugins failed to load and `eslint` (the sonarjs peer) is not installed. Adding it as a last resort...");
    addDeps(env, [`eslint@${COMPAT.eslint}`], log);
    changed.push("package.json (eslint added for the sonarjs peer)");
    smoke = runSmoke(env.root, env.pm, stagedConfig, paths.staging);
  }
  if (!smoke.ok) {
    fail(
      `Smoke test failed: expected diagnostics not produced (${smoke.missing.join(", ")}).\n${lastLines(smoke.output, 12)}\n` +
        "Nothing in tools/oxlint or your config was changed. Dependencies installed above remain; use git (or the backup) to review/revert.",
    );
  }
  log.ok("Smoke test passed (sonarjs and anti-slop rules load and report).");
}

function recordBaseline(paths: ProjectPaths, log: Logger): "recorded" | "failed" {
  log.step("Recording the violation baseline...");
  const result = exec(process.execPath, [paths.baselineScript, "--update", "--type-aware"], { cwd: paths.root });
  if (result.status === 0) {
    log.ok("Baseline recorded in tools/oxlint/baseline.json.");
    return "recorded";
  }
  log.warn(`Could not record the baseline; run \`lint:baseline\` manually.\n${lastLines(result.stderr || result.stdout, 5)}`);
  return "failed";
}

export async function install(options: InstallOptions, log: Logger): Promise<InstallResult> {
  const { root, profile, mode } = options;
  const env = detectEnvironment(root, options.pm);
  const paths = projectPaths(root);
  const bundled = loadBundledAntiSlop();
  const deps = planDependencies(root, profile, options.prettier, options.deps);
  const scripts = planScripts(env.pkg.scripts, { prettier: options.prettier, baseline: options.baseline });
  const ownership = vendoredOwnership(paths);
  const configExists = existsSync(paths.config);
  const configText = configExists ? readFileSync(paths.config, "utf8") : "";
  const configIsOurs = configExists && configReferencesPresets(configText);
  const configMatches = configIsOurs && configImportsMatch(configText, profile);
  const notes = collectNotes({ env, profile, deps, scripts, configExists, configIsOurs, configMatches, ownership });

  const result: InstallResult = {
    dryRun: options.dryRun,
    profile: profile.id,
    mode,
    packageManager: env.pm,
    settings: { prettier: options.prettier, baseline: options.baseline },
    antiSlop: { sha: bundled.sha, ownership },
    dependencies: { install: deps.toInstall.map((d) => `${d.name}@${d.version}`), keep: deps.kept },
    scripts: { add: scripts.add.map(([name]) => name), keep: scripts.keep },
    notes,
    changed: [],
    backupDir: null,
    smoke: null,
    baseline: null,
    violations: null,
    configSnippet: configExists && !configMatches ? configSnippet(profile) : null,
  };

  // ---- plan --------------------------------------------------------------
  const writes = [
    `tools/oxlint/presets/{${profile.presets.join(",")}}.ts`,
    "tools/oxlint/anti-slop/",
    "tools/oxlint/oxlint-kit.json",
    ...(configExists ? [] : ["oxlint.config.ts"]),
    ...(options.baseline ? ["tools/oxlint/baseline-check.mjs"] : []),
    ...(scripts.add.length ? [`package.json scripts (${result.scripts.add.join(", ")})`] : []),
    ...(options.prettier ? [".prettierignore"] : []),
  ];
  log.step(`Profile ${profile.id}${profile.experimental ? " (experimental)" : ""}, mode ${mode}, package manager ${env.pm}`);
  log.step(`anti-slop ${bundled.sha.slice(0, 12)} (bundled with ${PKG_NAME}@${PKG_VERSION})`);
  log.info(`install : ${result.dependencies.install.join(", ") || "(nothing new)"}`);
  log.info(`keep    : ${deps.kept.join(", ") || "(none)"}`);
  log.info(`write   : ${writes.join(", ")}`);
  for (const note of notes) log.warn(note);

  if ((ownership === "edited" || ownership === "unknown") && !options.force) {
    const message =
      ownership === "edited"
        ? "tools/oxlint/anti-slop was edited locally (its hash differs from the install record). Review it, then pass --force to replace it."
        : "tools/oxlint/anti-slop exists without an install record. Pass --force to replace it with the bundled copy.";
    if (!options.dryRun) fail(message);
    log.warn(message);
  }
  if (options.dryRun) {
    log.ok("Dry run: nothing was changed.");
    return result;
  }
  if (options.confirmPlan && !(await options.confirmPlan())) fail("Cancelled. Nothing was changed.");

  // ---- guard -------------------------------------------------------------
  if (env.isRepo) {
    if (env.dirty.length && !options.allowDirty) {
      fail(
        `Git working tree has uncommitted changes:\n${env.dirty.slice(0, 8).join("\n")}\n` +
          "Commit or stash them first (or pass --allow-dirty), so the install is easy to review and revert.",
      );
    }
  } else {
    result.backupDir = backupFiles(paths);
    log.warn(`Not a git repository. Backed up files that may change to ${result.backupDir}.`);
  }

  const tx = new Transaction();
  const changed: string[] = [];
  const stagedOxlint = join(paths.staging, "tools", "oxlint");
  const stagedVendored = join(stagedOxlint, "anti-slop");
  const stagedPresets = join(stagedOxlint, "presets");
  const stagedConfig = join(paths.staging, "oxlint.config.ts");

  try {
    // ---- stage -----------------------------------------------------------
    rmSync(paths.staging, { recursive: true, force: true });
    mkdirSync(stagedPresets, { recursive: true });
    cpSync(bundled.dir, stagedVendored, { recursive: true });
    writeFileSync(join(stagedVendored, PROVENANCE_FILE), provenance(bundled));
    for (const preset of profile.presets) {
      writeFileSync(join(stagedPresets, `${preset}.ts`), renderPreset(preset, profile, mode));
    }
    writeFileSync(stagedConfig, renderConfig(profile));

    if (options.confirmChanges) {
      const changes: PendingChanges = {
        presets: diffDirs(paths.presets, stagedPresets),
        antiSlop: diffDirs(paths.vendored, stagedVendored),
        deps,
      };
      if (!(await options.confirmChanges(changes))) fail("Update declined. Nothing was changed.");
    }

    // ---- dependencies + smoke test ---------------------------------------
    if (deps.toInstall.length) {
      addDeps(env, deps.toInstall.map((d) => `${d.name}@${d.version}`), log);
      changed.push("package.json (devDependencies)", "lockfile");
    }
    if (options.smoke) {
      smokeGate(env, paths, profile, stagedConfig, log, changed);
      result.smoke = "passed";
    } else {
      log.warn("Smoke test skipped (--no-smoke).");
      result.smoke = "skipped";
    }

    // ---- apply (all-or-nothing) ------------------------------------------
    const state: InstallState = {
      tool: PKG_NAME,
      version: PKG_VERSION,
      profile: profile.id,
      mode,
      prettier: options.prettier,
      baseline: options.baseline,
      antiSlop: { repo: bundled.repo, sha: bundled.sha, contentHash: bundled.contentHash },
    };
    tx.replaceDir(stagedVendored, paths.vendored);
    tx.replaceDir(stagedPresets, paths.presets);
    tx.writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`);
    tx.removeFile(paths.legacyLock);
    changed.push("tools/oxlint/anti-slop/", "tools/oxlint/presets/", "tools/oxlint/oxlint-kit.json");

    if (!configExists) {
      tx.writeFile(paths.config, renderConfig(profile));
      changed.push("oxlint.config.ts (created)");
    }
    if (options.baseline) {
      tx.writeFile(paths.baselineScript, readFileSync(BASELINE_TEMPLATE));
      changed.push("tools/oxlint/baseline-check.mjs");
    }
    if (scripts.add.length) {
      tx.writeFile(paths.pkg, withScripts(readFileSync(paths.pkg, "utf8"), scripts.add));
      changed.push(`package.json scripts: ${result.scripts.add.join(", ")}`);
    }
    if (options.prettier) {
      const current = existsSync(paths.prettierignore) ? readFileSync(paths.prettierignore, "utf8") : "";
      tx.writeFile(paths.prettierignore, renderPrettierIgnore(current));
      changed.push(".prettierignore (managed block)");
    }
    tx.commit();
  } catch (error) {
    const problems = tx.rollback();
    if (problems.length) log.warn(`Rollback was incomplete:\n${problems.join("\n")}`);
    throw error;
  } finally {
    rmSync(paths.staging, { recursive: true, force: true });
    result.changed = [...new Set(changed)];
  }

  // ---- after apply -------------------------------------------------------
  if (options.baseline) {
    // Never overwrite an existing baseline here: that would hide regressions.
    result.baseline = existsSync(paths.baseline) ? "kept" : recordBaseline(paths, log);
  }
  result.violations = collectViolations(root, env.pm, profile);
  return result;
}
