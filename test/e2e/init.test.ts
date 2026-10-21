import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const pm = process.env.E2E_PM ?? "npm";
const cli = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const dir = mkdtempSync(join(tmpdir(), `oxlint-kit-e2e-${pm}-`));

function kit(...args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args, "--cwd", dir, "--json", "--pm", pm], { encoding: "utf8" });
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: r.status, stderr: r.stderr, json };
}

describe(`init, doctor, update with ${pm}`, () => {
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("sets up a fresh TypeScript project",
