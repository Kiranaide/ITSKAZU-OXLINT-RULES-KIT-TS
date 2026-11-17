import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exec } from "../env/exec";
import { execCommand, type PackageManager } from "../env/pm";

export const SMOKE_FIXTURE = `export function smoke(a: number): boolean {
  if (a > 1) {
    return true;
  }
  return false;
}

export const same = (n: number): boolean => n === n;

export const doubled = [1, 2, 3].filter((n) => n > 1).map((n) => n * 2);

export function floating(): void {
  Promise.resolve();
}

// eslint-disable-next-line eslint/no-self-compare
export const alsoSame = (n: number): boolean => n === n;
`;

/** One native sonar rule and one rule per vendored JS plugin: proves every layer reports. */
export const SMOKE_EXPECTED = [
  "eslint(no-self-compare)",
  "anti-slop(no-array-filter-map)",
  "kira(require-suppression-reason)",
];

/** Proves tsgolint actually ran type-aware when asked to. */
export const SMOKE_TYPEAWARE_EXPECTED = "typescript(no-floating-promises)";

export interface Diagnostic {
  code?: string;
  severity?: string;
  filename?: string;
}

export function parseDiagnostics(stdout: string): Diagnostic[] | null {
  try {
    const parsed = JSON.parse(stdout) as { diagnostics?: unknown };
    return Array.isArray(parsed.diagnostics) ? (parsed.diagnostics as Diagnostic[]) : null;
  } catch {
    return null;
  }
}

export interface SmokeResult {
  ok: boolean;
  missing: string[];
  output: string;
}

export function runSmoke(root: string, pm: PackageManager, configPath: string, workDir: string, typeAware = false): SmokeResult {
  mkdirSync(workDir, { recursive: true });
  const fixture = join(workDir, "fixture.ts");
  writeFileSync(fixture, SMOKE_FIXTURE);
  const [cmd, args] = execCommand(pm, ["oxlint", ...(typeAware ? ["--type-aware"] : []), "-c", configPath, "-f", "json", fixture]);
  const result = exec(cmd, args, { cwd: root });
  const output = `${result.stdout}${result.stderr}`;
  const missing = SMOKE_EXPECTED.filter((code) => !output.includes(code));
  if (typeAware && !output.includes(SMOKE_TYPEAWARE_EXPECTED)) missing.push(SMOKE_TYPEAWARE_EXPECTED);
  return { ok: missing.length === 0, missing, output };
}
