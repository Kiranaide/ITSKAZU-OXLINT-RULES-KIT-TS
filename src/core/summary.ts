import { exec } from "../env/exec";
import { execCommand, type PackageManager } from "../env/pm";
import type { Profile } from "../profiles";
import { RULES, type Layer } from "../rules";
import type { Logger } from "../ui/logger";
import { parseDiagnostics } from "./smoke";

export interface ViolationRow {
  code: string;
  count: number;
  severity: string;
  layer: Layer | "other";
}

export interface ViolationSummary {
  total: number;
  rules: number;
  rows: ViolationRow[];
}

export function collectViolations(root: string, pm: PackageManager, profile: Profile): ViolationSummary | null {
  const [cmd, args] = execCommand(pm, ["oxlint", "-f", "json"]);
  const diagnostics = parseDiagnostics(exec(cmd, args, { cwd: root }).stdout);
  if (!diagnostics) return null;

  const layerOf = new Map<string, Layer>();
  for (const preset of profile.presets) for (const [name, layer] of RULES[preset]) layerOf.set(name, layer);

  const counts = new Map<string, { count: number; severity: string }>();
  for (const d of diagnostics) {
    const code = d.code ?? "unknown";
    const entry = counts.get(code) ?? { count: 0, severity: d.severity ?? "" };
    entry.count += 1;
    counts.set(code, entry);
  }

  const rows = [...counts]
    .map(([code, { count, severity }]) => ({
      code,
      count,
      severity,
      layer: layerOf.get(code.replace(/^(.+)\((.+)\)$/, "$1/$2")) ?? ("other" as const),
    }))
    .sort((a, b) => b.count - a.count);
  return { total: diagnostics.length, rules: rows.length, rows };
}

export function printViolations(log: Logger, summary: ViolationSummary, limit = 15): void {
  log.raw(`\nExisting violations: ${summary.total} across ${summary.rules} rules`);
  for (const row of summary.rows.slice(0, limit)) {
    log.raw(`  ${String(row.count).padStart(5)}  ${row.code.padEnd(58)} ${row.layer.padEnd(5)} ${row.severity}`);
  }
  if (summary.rows.length > limit) log.raw(`  ... and ${summary.rows.length - limit} more rules`);
}
