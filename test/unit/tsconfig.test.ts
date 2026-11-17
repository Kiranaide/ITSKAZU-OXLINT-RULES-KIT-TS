import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tsIncludesEverything } from "../../src/env/tsconfig";

const dir = join(tmpdir(), `oxlint-kit-tsconfig-${process.pid}`);
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

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