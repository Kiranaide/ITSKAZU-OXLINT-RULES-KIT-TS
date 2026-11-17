import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { planTsAction } from "../../src/core/tsdecision";
import { detectTsState, findTsOverrides } from "../../src/env/typescript";
import { tsIncludesEverything } from "../../src/env/tsconfig";
import type { Environment, PackageJson } from "../../src/env/detect";
import { GENERATED_SONAR_RULES } from "../../src/rules/sonar.generated";

const dir = join(tmpdir(), `oxlint-kit-ts-detect-${process.pid}`);

function makeProject(pkg: object, installed?: { name: string; version: string }): string {
  const root = join(dir, Math.random().toString(36).slice(2));
  mkdirSync(join(root, "node_modules"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  if (installed) {
    mkdirSync(join(root, "node_modules", "typescript"), { recursive: true });
    writeFileSync(join(root, "node_modules", "typescript", "package.json"), JSON.stringify(installed));
  }
  return root;
}

const baseEnv = (overrides: Partial<Environment>): Environment =>
  ({
    root: dir,
    pm: "npm",
    pkg: {},
    isRepo: false,
    dirty: [],
    hasTsconfig: false,
    tsStrict: null,
    tsState: "none",
    tsOverrides: [],
    eslintConfigs: [],
    biomeConfigs: [],
    hasPrettierConfig: false,
    workspace: { isWorkspaceRoot: false, parentRoot: null },
    ...overrides,
  }) as Environment;

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("detectTsState", () => {
  const pkgOf = (root: string): PackageJson => JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;

  it("classifies by installed package name first", () => {
    const a = makeProject({}, { name: "typescript", version: "7.0.2" });
    const b = makeProject({}, { name: "@typescript/typescript6", version: "6.0.2" });
    const c = makeProject({}, { name: "typescript", version: "5.9.3" });
    expect(detectTsState(a, pkgOf(a))).toBe("native-plain");
    expect(detectTsState(b, pkgOf(b))).toBe("aliased");
    expect(detectTsState(c, pkgOf(c))).toBe("legacy");
  });

  it("falls back to the dep spec when nothing is installed", () => {
    const a = makeProject({ devDependencies: { typescript: "npm:@typescript/typescript6@^6.0.2" } });
    const b = makeProject({ devDependencies: { typescript: "^7.0.2" } });
    const c = makeProject({ devDependencies: { typescript: "^5.9.0" } });
    const d = makeProject({});
    expect(detectTsState(a, pkgOf(a))).toBe("aliased");
    expect(detectTsState(b, pkgOf(b))).toBe("native-plain");
    expect(detectTsState(c, pkgOf(c))).toBe("legacy");
    expect(detectTsState(d, pkgOf(d))).toBe("none");
  });

  it("prefers installed state over a stale spec", () => {
    const root = makeProject(
      { devDependencies: { typescript: "^5.9.0" } },
      { name: "typescript", version: "7.0.2" },
    );
    expect(detectTsState(root, pkgOf(root))).toBe("native-plain");
  });
});

describe("findTsOverrides", () => {
  it("finds typescript pins in all override locations", () => {
    const pkg: PackageJson = {
      overrides: { typescript: "^7.0.2" },
      resolutions: { "foo/typescript": "7" },
      pnpm: { overrides: { "typescript@7": "7.0.2" } },
    };
    expect(findTsOverrides(pkg)).toHaveLength(3);
  });

  it("ignores unrelated overrides", () => {
    expect(findTsOverrides({ overrides: { eslint: "^9" } })).toEqual([]);
  });
});

describe("tsIncludesEverything", () => {
  it("flags wildcard includes, not src-scoped ones", () => {
    const wide = join(dir, "tsconfig-wide.json");
    writeFileSync(wide, JSON.stringify({ include: ["**/*"] }));
    const scoped = join(dir, "tsconfig-src.json");
    writeFileSync(scoped, JSON.stringify({ include: ["src/**/*"] }));
    expect(tsIncludesEverything(wide)).toBe(true);
    expect(tsIncludesEverything(scoped)).toBe(false);
  });
});

describe("planTsAction", () => {
  it("blocks on typescript overrides when sonar is wanted", () => {
    const d = planTsAction(baseEnv({ tsOverrides: ["overrides.typescript = ^7"], tsState: "aliased" }), true);
    expect(d.action.kind).toBe("blocked");
  });

  it("native-plain with sonar asks for the alias pair", () => {
    const d = planTsAction(baseEnv({ tsState: "native-plain" }), true);
    expect(d.action.kind).toBe("install-pair");
    expect(d.asked).toContain("alias");
  });

  it("native-plain without sonar needs nothing", () => {
    expect(planTsAction(baseEnv({ tsState: "native-plain" }), false).action.kind).toBe("nothing");
  });

  it("aliased and legacy never act", () => {
    expect(planTsAction(baseEnv({ tsState: "aliased" }), true).action.kind).toBe("nothing");
    expect(planTsAction(baseEnv({ tsState: "legacy" }), true).action.kind).toBe("nothing");
    expect(planTsAction(baseEnv({ tsState: "none" }), true).action.kind).toBe("nothing");
  });
});

describe("GENERATED_SONAR_RULES", () => {
  it("disables type-aware rules and the known-bad ones, enables syntax-only", () => {
    const layer = (name: string): string | undefined => {
      const entry = GENERATED_SONAR_RULES.find(([n]) => n === `sonarjs/${name}`);
      return entry?.[1];
    };
    expect(layer("no-small-switch")).toBe("off"); // type-aware: dead through the JS bridge
    expect(layer("no-reference-error")).toBe("off");
    expect(layer("file-header")).toBe("off");
    expect(layer("no-identical-expressions")).toBe("soft"); // enabled by the generated defaults
    expect(layer("function-name")).toBe("soft");
    expect(GENERATED_SONAR_RULES.length).toBeGreaterThan(250);
  });
});
