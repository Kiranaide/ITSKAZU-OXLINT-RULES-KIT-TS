import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { hashDir } from "../../src/core/hash";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oxkit-hash-"));
  mkdirSync(join(dir, "rules"));
  writeFileSync(join(dir, "index.ts"), "export {};\n");
  writeFileSync(join(dir, "rules", "a.ts"), "export const a = 1;\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("ignores the provenance note", () => {
  const before = hashDir(dir);
  writeFileSync(join(dir, "UPSTREAM.md"), "provenance");
  expect(hashDir(dir)).toBe(before);
});

it("changes when content changes", () => {
  const before = hashDir(dir);
  writeFileSync(join(dir, "rules", "a.ts"), "export const a = 2;\n");
  expect(hashDir(dir)).not.toBe(before);
});
