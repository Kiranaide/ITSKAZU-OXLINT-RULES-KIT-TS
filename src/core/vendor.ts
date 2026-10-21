import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson } from "../env/fs";
import { fail } from "../errors";
import { PKG_NAME, PKG_VERSION, VENDOR_DIR, VENDOR_LOCK } from "../meta";
import { hashDir } from "./hash";

export interface BundledAntiSlop {
  dir: string;
  repo: string;
  sha: string;
  contentHash: string;
}

export function loadBundledAntiSlop(): BundledAntiSlop {
  const lock = readJson<{ repo?: string; sha?: string; contentHash?: string }>(VENDOR_LOCK);
  const { repo, sha, contentHash } = lock ?? {};
  if (!repo || !sha || !contentHash || !existsSync(join(VENDOR_DIR, "index.ts"))) {
    fail(`This build of ${PKG_NAME} has no bundled anti-slop copy. Maintainers: run \`pnpm sync-anti-slop\` before building.`);
  }
  if (hashDir(VENDOR_DIR) !== contentHash) {
    fail(`The anti-slop copy bundled in ${PKG_NAME}@${PKG_VERSION} does not match its lock hash. Reinstall the package.`);
  }
  return { dir: VENDOR_DIR, repo, sha, contentHash };
}

export const provenance = (bundled: BundledAntiSlop): string =>
  `# anti-slop provenance\n\nSource: ${bundled.repo}\nCommit: ${bundled.sha}\nContent hash: ${bundled.contentHash}\n\n` +
  `Vendored by ${PKG_NAME}@${PKG_VERSION}; recorded in tools/oxlint/oxlint-kit.json.\n` +
  `Do not edit by hand: the hash check will flag it. Move forward with \`npx ${PKG_NAME} update\`.\n`;
