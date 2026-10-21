#!/usr/bin/env node
// Managed by oxlint-kit. Compares Oxlint diagnostics with tools/oxlint/baseline.json so CI
// fails only on new violations. Counts are kept per file and rule, so moving code inside
// a file does not break the baseline.
//
//   node tools/oxlint/baseline-check.mjs [oxlint args...]           check (exit 1 on new violations)
//   node tools/oxlint/baseline-check.mjs --update [oxlint args...]  record the current state

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

const root = process.cwd();
const baselinePath = join(root, "tools", "oxlint", "baseline.json");
const argv = process.argv.slice(2);
const update = argv.includes("--update");
const oxlintArgs = argv.filter((arg) => arg !== "--update");

function findPackageDir(name) {
  let dir = root;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function runOxlint() {
  const pkgDir = findPackageDir("oxlint");
  if (!pkgDir) {
    console.error("oxlint is not installed. Run your package manager's install first.");
    process.exit(2);
  }
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin && pkg.bin.oxlint;
  if (!bin) {
    console.error("Could not find the oxlint binary in its package.json.");
    process.exit(2);
  }
  const result = spawnSync(process.execPath, [join(pkgDir, bin), "-f", "json", ...oxlintArgs], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  try {
    const parsed = JSON.parse(result.stdout);
    if (Array.isArray(parsed.diagnostics)) return parsed.diagnostics;
  } catch {
    // fall through to the error below
  }
  console.error("Could not parse Oxlint's JSON output:");
  console.error((result.stderr || result.stdout || "").trim().split("\n").slice(-10).join("\n"));
  process.exit(2);
}

function toKey(diagnostic) {
  const raw = diagnostic.filename ?? diagnostic.file ?? "unknown";
  const file = (isAbsolute(raw) ? relative(root, raw) : raw).split("\\").join("/");
  return file + " :: " + (diagnostic.code ?? "unknown");
}

const counts = {};
for (const diagnostic of runOxlint()) {
  const key = toKey(diagnostic);
  counts[key] = (counts[key] ?? 0) + 1;
}

if (update) {
  const entries = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselinePath, JSON.stringify({ version: 1, entries }, null, 2) + "\n");
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log("Baseline recorded: " + total + " violations across " + Object.keys(entries).length + " file/rule pairs.");
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error("No baseline at tools/oxlint/baseline.json. Run the lint:baseline script first.");
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")).entries ?? {};

const regressions = [];
for (const [key, count] of Object.entries(counts)) {
  const allowed = baseline[key] ?? 0;
  if (count > allowed) regressions.push({ key, count, allowed });
}
const improved = Object.entries(baseline).filter(([key, allowed]) => (counts[key] ?? 0) < allowed).length;

if (regressions.length) {
  console.error(regressions.length + " file/rule pair(s) have new violations:");
  for (const { key, count, allowed } of regressions) console.error("  " + key + "  (" + allowed + " -> " + count + ")");
  console.error("Run the lint script to see details. Fix them, or run lint:baseline if the increase is intended.");
  process.exit(1);
}
console.log(
  "No new violations." + (improved ? " " + improved + " file/rule pair(s) improved; run lint:baseline to lock that in." : ""),
);
