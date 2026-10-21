import pc from "picocolors";
import type { DirDiff, } from "../core/diff";
import { isEmptyDiff } from "../core/diff";
import type { InstallResult, PendingChanges } from "../core/install";
import { printViolations } from "../core/summary";
import { runScriptPrefix } from "../env/pm";
import { PKG_NAME } from "../meta";
import type { Logger } from "./logger";

export function printReport(result: InstallResult, log: Logger): void {
  if (log.json) {
    log.result({ ok: true, ...result });
    return;
  }
  if (result.dryRun) return;

  if (result.violations) printViolations(log, result.violations);
  else log.warn("Could not read Oxlint's JSON output for the violation summary. Run `lint` to see current violations.");

  const run = runScriptPrefix(result.packageManager);
  const rule = pc.green("━".repeat(54));
  log.raw(`\n${rule}`);
  log.raw(pc.bold(`Installed (${result.profile}, ${result.mode})`));
  log.raw("\nChanged:");
  for (const item of result.changed) log.raw(`  - ${item}`);
  if (result.backupDir) log.raw(`\nBackup: ${result.backupDir}`);
  log.raw("\nUse:");
  log.raw(`  ${run} lint            fast; editor and pre-commit (type-aware rules skipped)`);
  log.raw(`  ${run} lint:strict     adds --type-aware`);
  if (result.settings.baseline) log.raw(`  ${run} lint:ci         CI: fails only on new violations (baseline)`);
  log.raw(`  ${run} check           lint:strict + tsc${result.settings.prettier ? " + prettier" : ""}`);
  log.raw(`  npx ${PKG_NAME} update   tested versions + bundled anti-slop (shows a diff first)`);
  log.raw(`  npx ${PKG_NAME} doctor   diagnose the setup`);
  if (result.configSnippet) log.raw(`\nMerge into your oxlint.config.ts:\n${result.configSnippet}`);
  log.raw(rule);
}

export function printChanges(log: Logger, changes: PendingChanges): void {
  const section = (title: string, diff: DirDiff) => {
    if (isEmptyDiff(diff)) return;
    log.info(`${title}:`);
    for (const file of diff.added) log.info(pc.green(`  + ${file}`));
    for (const file of diff.changed) log.info(pc.yellow(`  ~ ${file}`));
    for (const file of diff.removed) log.info(pc.red(`  - ${file}`));
  };
  section("tools/oxlint/presets", changes.presets);
  section("tools/oxlint/anti-slop", changes.antiSlop);
  if (changes.deps.toInstall.length) {
    log.info(`dependencies: ${changes.deps.toInstall.map((d) => `${d.name}@${d.version}`).join(", ")}`);
  }
}
