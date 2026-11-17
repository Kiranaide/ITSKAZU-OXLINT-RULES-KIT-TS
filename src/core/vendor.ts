import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../env/fs";
import { fail } from "../errors";
import { KIRA_DIR, KIRA_LOCK, PKG_NAME, PKG_VERSION, VENDOR_DIR, VENDOR_LOCK } from "../meta";
import { hashDir } from "./hash";

export interface BundledPlugin {
  dir: string;
  repo: string;
  sha: string;
  contentHash: string;
}

function loadBundled(dir: string, lockPath: string, name: string, missing: string): BundledPlugin {
  const lock = readJson<{ repo?: string; sha?: string; contentHash?: string }>(lockPath);
  const { repo, sha, contentHash } = lock ?? {};
  if (!repo || !sha || !contentHash || !existsSync(join(dir, "index.ts"))) {
    fail(`This build of ${PKG_NAME} has no bundled ${name} copy. ${missing}`);
  }
  if (hashDir(dir) !== contentHash) {
    fail(`The ${name} copy bundled in ${PKG_NAME}@${PKG_VERSION} does not match its lock hash. Reinstall the package.`);
  }
  return { dir, repo, sha, contentHash };
}

export function loadBundledAntiSlop(): BundledPlugin {
  return loadBundled(VENDOR_DIR, VENDOR_LOCK, "anti-slop", "Maintainers: run `bun run sync-anti-slop` before building.");
}

export function loadBundledKira(): BundledPlugin {
  return loadBundled(KIRA_DIR, KIRA_LOCK, "kira", "Maintainers: vendor/kira is a committed port; see vendor/kira/UPSTREAM.md.");
}

export const provenance = (bundled: BundledPlugin, name: string): string =>
  `# ${name} provenance\n\nSource: ${bundled.repo}\nCommit: ${bundled.sha}\nContent hash: ${bundled.contentHash}\n\n` +
  `Vendored by ${PKG_NAME}@${PKG_VERSION}; recorded in tools/oxlint/oxlint-kit.json.\n` +
  `Do not edit by hand: the hash check will flag it. Move forward with \`npx ${PKG_NAME} update\`.\n`;