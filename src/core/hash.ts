// Node built-ins only: scripts/sync-anti-slop.ts imports this file directly.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const PROVENANCE_FILE = "UPSTREAM.md";

export function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path, base) : [relative(base, path).split("\\").join("/")];
  });
}

/** Content hash of a directory, independent of file order and line endings; ignores the provenance note. */
export function hashDir(dir: string): string {
  const hash = createHash("sha256");
  for (const file of listFiles(dir).filter((f) => f !== PROVENANCE_FILE).sort()) {
    // git autocrlf checkouts must hash identically to the committed LF bytes.
    const text = readFileSync(join(dir, file), "utf8").replaceAll("\r\n", "\n");
    const digest = createHash("sha256").update(text).digest("hex");
    hash.update(`${file}\0${digest}\n`);
  }
  return hash.digest("hex");
}
