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

const FIXTURES: Fixture[] = [
  { name: "ts7-plain", deps: { typescript: "^7.0.2" } },
  { name: "ts7-aliased", deps: { typescript: "npm:@typescript/typescript6@^6.0.2", "@typescript/native": "npm:typescript@^7.0.2" } },
  { name: "ts5-legacy", deps: { typescript: "^5.9.0" } },
  { name: "global-ts-override", deps: { typescript: "^7.0.2" } },
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
  if (f.name === "global-ts-override") {
    const pkgPath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { overrides?: Record<string, string> };
    pkg.overrides = { typescript: "^7.0.2" };
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }
}

function writeProbe(root: string): void {
  // Two identical functions -> sonarjs/no-identical-functions; unawaited fetch -> no-floating-promises (type-aware).
  writeFileSync(
    join(root, "src", "probe.ts"),
    `export function a(x: number): number {\n  if (x > 1) {\n    return 1;\n  }\n  return 2;\n}\nexport function b(x: number): number {\n  if (x > 1) {\n    return 1;\n  }\n  return 2;\n}\nexport async function p(): Promise<void> {\n  fetch("x");\n}\n`,
  );
}

function runOxlint(root: string, typeAware: boolean): { stderr: string; stdout: string; status: number | null } {
  const r = spawnSync(process.execPath, ["-e", "process.exit(0)"], { encoding: "utf8" }); // warm nothing; keep shape simple
  void r;
  const args = ["-c", "oxlint.config.ts", "-f", "json", ...(typeAware ? ["--type-aware"] : []), "src"];
  const run = spawnSync("npx", ["--no-install", "oxlint", ...args], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  return { stderr: run.stderr, stdout: run.stdout, status: run.status };
}

describe(`init/doctor/update across TypeScript states with ${pm}`, () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const f of FIXTURES) {
    describe(f.name, () => {
      const root = join(dir, f.name);

      it("init reports a clean plan or a blocked override", () => {
        scaffold(f);
        const r = kit(f.name, "init", "--yes");
        if (f.name === "global-ts-override") {
          // Blocked: override pins typescript, defeating the alias. CLI must refuse and change nothing.
          expect(r.status).not.toBe(0);
          expect(`${r.stderr}${r.stdout}`).toContain("override");
          return;
        }
        expect(r.status).toBe(0);
        expect(r.json).not.toBeNull();
        expect(String(r.stderr)).not.toMatch(/TypeError|Cannot read properties of undefined/);
        writeProbe(root);
      });

      it("lint produces no crash and both coverage layers report", () => {
        if (f.name === "global-ts-override") return; // blocked in the previous test
        const lint = runOxlint(root, false);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
        expect(lint.stdout).toContain("sonarjs(no-identical-functions)");
      });

      it("type-aware lint reports no-floating-promises", () => {
        if (f.name === "global-ts-override") return;
        const lint = runOxlint(root, true);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
        expect(lint.stdout).toContain("typescript(no-floating-promises)");
      });

      it("doctor passes and update re-runs cleanly", () => {
        if (f.name === "global-ts-override") return;
        const d = kit(f.name, "doctor");
        expect(d.status).toBe(0);
        const u = kit(f.name, "update", "--yes");
        expect(u.status).toBe(0);
        expect(String(u.stderr)).not.toMatch(/TypeError|Cannot read properties of undefined/);
        // update rewrote the sonar preset; the shim path (ts7-plain with --yes decline) must still load
        const lint = runOxlint(root, false);
        expect(lint.stderr).not.toMatch(/TypeError|Cannot read properties of undefined/);
      });
    });
  }

  it("ts7-plain keeps the shim or alias decision visible in the install record", () => {
    const statePath = join(dir, "ts7-plain", "tools", "oxlint", "oxlint-kit.json");
    expect(existsSync(statePath)).toBe(true);
    const state = JSON.parse(readFileSync(statePath, "utf8")) as { tsResolution?: string };
    // --yes on native-plain => shim (never rewrite typescript silently)
    expect(["alias-pair", "shim"]).toContain(state.tsResolution);
  });
});
