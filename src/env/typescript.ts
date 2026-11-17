import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { PackageJson } from "./detect";
import { readJson } from "./fs";

export type TsState = "none" | "legacy" | "native-plain" | "aliased";

/** Tested alias pair (COMPAT-adjacent): `typescript` resolves to the TS 6 JS API, `@typescript/native` to the TS 7 compiler. */
export const TS6_ALIAS_SPEC = "typescript@npm:@typescript/typescript6@^6.0.2";
export const TS_NATIVE_SPEC = "@typescript/native@npm:typescript@^7.0.2";
export const TS_PAIR = [TS6_ALIAS_SPEC, TS_NATIVE_SPEC] as const;

/**
 * none          no typescript dep and nothing installed
 * legacy        TS 5/6 (plain or aliased spec, < 7): eslint-plugin-sonarjs loads as-is
 * native-plain  real typescript@7 installed: sonarjs's require("typescript") crashes on load
 * aliased       typescript resolves to @typescript/typescript6: sonarjs-safe
 */
export function detectTsState(root: string, pkg: PackageJson): TsState {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const spec: string | undefined = deps.typescript;

  const installed = readJson<{ name?: string; version?: string }>(join(root, "node_modules", "typescript", "package.json"));
  if (installed?.name && installed.version) {
    if (installed.name === "@typescript/typescript6") return "aliased";
    const major = Number(installed.version.split(".")[0]);
    if (installed.name === "typescript" && major >= 7) return "native-plain";
    return "legacy";
  }

  // Not installed (or hoisted out of sight): fall back to the dep spec.
  if (spec?.startsWith("npm:@typescript/typescript6")) return "aliased";
  const wanted = spec ? Number(spec.replace(/^[\^~>=<\s]*/, "").split(".")[0]) : NaN;
  if (spec && wanted >= 7) return "native-plain";
  return spec ? "legacy" : "none";
}

/** Keys of overrides/resolutions/pnpm.overrides that pin `typescript`; they would defeat the alias. */
export function findTsOverrides(pkg: PackageJson): string[] {
  const hits: string[] = [];
  const scan = (where: string, obj: unknown): void => {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === "typescript" || key.endsWith("/typescript") || key.endsWith("@typescript") || key.includes("typescript@")) {
        hits.push(`${where}.${key} = ${String(value)}`);
      }
    }
  };
  scan("overrides", pkg.overrides);
  scan("resolutions", pkg.resolutions);
  scan("pnpm.overrides", (pkg.pnpm as Record<string, unknown> | undefined)?.overrides);
  return hits;
}

/** Reads the installed plain/aliased typescript's version for display; null when not installed. */
export function installedTsVersion(root: string): string | null {
  const installed = readJson<{ name?: string; version?: string }>(join(root, "node_modules", "typescript", "package.json"));
  return installed?.version ?? null;
}

/** Post-install gate: eslint-plugin-sonarjs reads TypeFlags at module load; missing API = guaranteed crash. */
export function tsApiLoads(root: string, moduleName = "typescript"): { ok: boolean; detail: string } {
  const probe = `try{const t=require(${JSON.stringify(moduleName)});process.exit(typeof t.TypeFlags==='object'?0:1)}catch{process.exit(1)}`;
  try {
    execFileSync(process.execPath, ["-e", probe], { cwd: root, stdio: "ignore" });
    return { ok: true, detail: `require(${JSON.stringify(moduleName)}).TypeFlags is available` };
  } catch {
    return {
      ok: false,
      detail:
        `require(${JSON.stringify(moduleName)}) has no JS compiler API (TypeFlags missing). eslint-plugin-sonarjs will crash on load. ` +
        (moduleName === "typescript" ? `Reinstall the alias pair: ${TS6_ALIAS_SPEC}` : `Reinstall the dependency: ${moduleName}@^6.0.2`),
    };
  }
}
