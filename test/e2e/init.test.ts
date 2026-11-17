import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const pm = process.env.E2E_PM ?? "npm";
const cli = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const dir = mkdtempSync(join(tmpdir(), `oxlint-kit-e2e-${pm}-`));

function kit(project: string, ...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args, "--cwd", join(dir, project), "--json", "--pm", pm], { encoding: "utf8" });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, json };
}

interface Fixture {
  name: string;
  deps: Record<string, string>;
}

// The sonar preset is native Oxlint rules now: every TypeScript state behaves the same.
const FIXTURES: Fixture[] = [
  { name: "ts7-plain", deps: { typescript: "^7.0.2" } },
  { name: "ts5-legacy", deps: { typescript: "^5.9.0" } },
  { name: "no-typescript", deps: {} },
];

function scaffold(f: Fixture): void {
  const root = join(dir, f.name);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: f.name, version: "0.0.0", private: true, devDependencies: f.deps }, null, 2),
  );
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "Preserve", moduleResolution: "bundler", skipLibCheck: true }, include: ["src"] }));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.ts"), "export const x = 1;\n");
}

function writeProbe(root: string): void {
  // Self-comparison -> eslint/no-self-compare (sonar preset); unawaited promise ->
  // no-floating-promises (type-aware, no DOM lib needed); unexplained suppression ->
  // kira(require-suppression-reason).
  writeFileSync(
    join(root, "src", "probe.ts"),
    `export const same = (n: number): boolean => n === n;\nexport function floating(): void {\n  Promise.resolve();\n}\n// eslint-disable-next-line eslint/no-self-compare\nexport const alsoSame = (n: number): boolean => n === n;\n`,
  );
}

function runOxlint(root: string, typeAware: boolean): { stderr: string; stdout: string; status: number | null } {
  const args = ["-c", "oxlint.config.ts", "-f", "json", ...(typeAware ? ["--type-aware"] : []), "src"];
  const run = spawnSync("npx", ["--no-install", "oxlint", ...args], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  return { stderr: run.stderr, stdout: run.stdout, status: run.status };
}

describe(`init/doctor/update across TypeScript states with ${pm}`, () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const f of FIXTURES) {
    describe(f.name, () => {
      const root = join(dir, f.name);

      it("init reports a clean plan", () => {
        scaffold(f);
        const r = kit(f.name, "init", "--yes");
        expect(r.status).toBe(0);
        expect(r.json).not.toBeNull();
        expect(String(r.stderr)).not.toMatch(/TypeError|Cannot read properties of undefined/);
        writeProbe(root);
      });

      it("lint produces no crash and the sonar preset reports", () => {
        const lint = runOxlint(root, false);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
        expect(lint.stdout).toContain("eslint(no-self-compare)");
        expect(lint.stdout).toContain("kira(require-suppression-reason)");
      });

      it("type-aware lint reports no-floating-promises", () => {
        const lint = runOxlint(root, true);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
        expect(lint.stdout).toContain("typescript(no-floating-promises)");
      });

      it("doctor passes and update re-runs cleanly", () => {
        const d = kit(f.name, "doctor");
        expect(d.status).toBe(0);
        const u = kit(f.name, "update", "--yes");
        expect(u.status).toBe(0);
        expect(String(u.stderr)).not.toMatch(/TypeError|Cannot read properties of undefined/);
        const lint = runOxlint(root, false);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
      });

      it("never touches the typescript dependency", () => {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { devDependencies?: Record<string, string> };
        expect(pkg.devDependencies?.typescript ?? null).toBe(f.deps.typescript ?? null);
        expect(pkg.devDependencies?.["@typescript/native"]).toBeUndefined();
        expect(pkg.devDependencies?.["eslint-plugin-sonarjs"]).toBeUndefined();
        expect(existsSync(join(root, "tools", "oxlint", "sonarjs-ts6.cjs"))).toBe(false);
      });
    });
  }

  it("writes an install record without TS-resolution state", () => {
    const project = join(dir, "ts7-plain");
    const statePath = join(project, "tools", "oxlint", "oxlint-kit.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf8")) as { profile?: string; mode?: string; tsResolution?: string; kira?: { sha?: string } };
    expect(state.profile).toBe("ts");
    expect(state.mode).toBe("adopt");
    expect(state.tsResolution).toBeUndefined();
    expect(state.kira?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(project, "tools", "oxlint", "kira", "index.ts"))).toBe(true);
    const scope = JSON.parse(readFileSync(join(project, "tools", "oxlint", "package.json"), "utf8")) as { type?: string };
    expect(scope.type).toBe("module");
  });
});