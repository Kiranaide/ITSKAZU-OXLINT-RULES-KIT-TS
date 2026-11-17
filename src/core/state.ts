import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../env/fs";
import { isProfileId, type ProfileId } from "../profiles";
import { hasManagedBlock } from "../render/prettierignore";
import { isMode, type Mode } from "../rules";
import { hashDir } from "./hash";
import type { ProjectPaths } from "./paths";

export interface InstallState {
  tool: string;
  version: string;
  profile: ProfileId;
  mode: Mode;
  prettier: boolean;
  baseline: boolean;
  antiSlop: { repo: string; sha: string; contentHash: string };
}

export function readState(paths: ProjectPaths): InstallState | null {
  const state = readJson<Partial<InstallState>>(paths.state);
  if (!state?.antiSlop?.contentHash || !isProfileId(state.profile) || !isMode(state.mode)) return null;
  return state as InstallState;
}

/** Lockfile written by the original install-lint.mjs. */
export function readLegacyLock(paths: ProjectPaths): { sha: string; contentHash: string } | null {
  const lock = readJson<{ sha?: string; contentHash?: string }>(paths.legacyLock);
  return lock?.sha && lock.contentHash ? { sha: lock.sha, contentHash: lock.contentHash } : null;
}

/**
 * none     no vendored copy yet
 * managed  recorded by this CLI and unchanged
 * legacy   recorded by install-lint.mjs and unchanged (adopted silently)
 * edited   recorded, but the content changed locally
 * unknown  vendored copy without any record
 */
export type Ownership = "none" | "managed" | "legacy" | "edited" | "unknown";

export function vendoredOwnership(paths: ProjectPaths): Ownership {
  if (!existsSync(paths.vendored)) return "none";
  const state = readState(paths);
  const expected = state?.antiSlop.contentHash ?? readLegacyLock(paths)?.contentHash;
  if (!expected) return "unknown";
  if (hashDir(paths.vendored) !== expected) return "edited";
  return state ? "managed" : "legacy";
}

export interface InstalledSettings {
  profile: ProfileId;
  mode: Mode;
  prettier: boolean;
  baseline: boolean;
  source: "state" | "legacy";
  version: string | null;
}

export function installedSettings(paths: ProjectPaths): InstalledSettings | null {
  const state = readState(paths);
  if (state) {
    return { profile: state.profile, mode: state.mode, prettier: state.prettier, baseline: state.baseline, source: "state", version: state.version };
  }
  // Legacy installs: read profile and mode from the generated preset header.
  const basePreset = join(paths.presets, "base.ts");
  if (!existsSync(basePreset)) return null;
  const match = /\(profile: ([\w-]+), mode: (\w+)\)/.exec(readFileSync(basePreset, "utf8"));
  const profile = match?.[1];
  const mode = match?.[2];
  if (!isProfileId(profile) || !isMode(mode)) return null;
  const ignore = existsSync(paths.prettierignore) ? readFileSync(paths.prettierignore, "utf8") : "";
  return {
    profile,
    mode,
    prettier: hasManagedBlock(ignore),
    baseline: existsSync(paths.baselineScript),
    source: "legacy",
    version: null,
  };
}
