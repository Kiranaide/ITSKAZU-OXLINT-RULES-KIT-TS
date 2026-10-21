import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDevCommand, detectPackageManager } from "../../src/env/pm";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "oxkit-pm-"));
  writeFileSync(join(dir, "package.json"), "{}");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("detectPackageManager", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["package-lock.json", "npm"],
  ] as const)("detects %s as %s", (file, pm) => {
    writeFileSync(join(dir, file), "");
    expect(detectPackageManager(dir)).toBe(pm);
  });

  it("falls back to the packageManager field", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "pnpm@10.0.0" }));
    expect(detectPackageManager(dir)).toBe("pnpm");
  });

  it("defaults to npm", () => expect(detectPackageManager(dir)).toBe("npm"));
});

it("builds exact dev-dependency installs", () => {
  expect(addDevCommand("pnpm", ["oxlint@1.0.0"])).toEqual(["pnpm", ["add", "-D", "--save-exact", "oxlint@1.0.0"]]);
});
