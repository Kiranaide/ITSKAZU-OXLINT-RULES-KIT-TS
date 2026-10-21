import { existsSync, readFileSync } from "node:fs";

/** true when `"strict": true` is visible in this file; null when unknown (extends is not followed). */
export function readTsStrict(path: string): boolean | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const cleaned = raw.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(cleaned) as { compilerOptions?: { strict?: unknown } };
    return parsed.compilerOptions?.strict === true ? true : null;
  } catch {
    return /"strict"\s*:\s*true/.test(raw) ? true : null;
  }
}
