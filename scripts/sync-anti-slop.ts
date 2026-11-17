// Maintainer script (runs on Node 22.18+ via native type stripping).
//   node scripts/sync-anti-slop.ts               re-vendor the locked (or default) commit
//   node scripts/sync-anti-slop.ts --sha <sha>   vendor a specific commit
//   node scripts/sync-anti-slop.ts --head        vendor upstream HEAD
//   node scripts/sync-anti-slop.ts --check       verify vendor/ matches the locks (CI, prepublish)
//   node scripts/sync-anti-slop.ts --rehash-kira refresh vendor/kira.lock.json after a reviewed port edit
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { hashDir } from "../src/core/hash.ts";

const REPO = "https://github.com/dmmulroy/anti-slop.git";
const DEFAULT_SHA = "13909c9e07590f5a85d93c62712259fe14a883f7";
const ROOT = join(import.meta.dirname, "..");
const VENDOR = join(ROOT, "vendor", "anti-slop");
const LOCK = join(ROOT, "vendor", "anti-slop.lock.json");
const KIRA = join(ROOT, "vendor", "kira");
const KIRA_LOCK = join(ROOT, "vendor", "kira.lock.json");

interface Lock {
  repo: string;
  sha: string;
  contentHash: string;
}

const { values } = parseArgs({
  options: {
    sha: { type: "string" },
    head: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    "rehash-kira": { type: "boolean", default: false },
  },
});

const git = (args: string[], cwd?: string): string => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const readLock = (): Lock | null => (existsSync(LOCK) ? (JSON.parse(readFileSync(LOCK, "utf8")) as Lock) : null);

if (values.check) {
  const lock = readLock();
  if (!lock || !existsSync(join(VENDOR, "index.ts"))) {
    console.error("vendor/anti-slop is missing. Run `bun run sync-anti-slop` and commit the result.");
    process.exit(1);
  }
  if (hashDir(VENDOR) !== lock.contentHash) {
    console.error("vendor/anti-slop does not match vendor/anti-slop.lock.json. Re-run `bun run sync-anti-slop`.");
    process.exit(1);
  }
  const kiraLock = existsSync(KIRA_LOCK) ? (JSON.parse(readFileSync(KIRA_LOCK, "utf8")) as Lock) : null;
  if (!kiraLock || !existsSync(join(KIRA, "index.ts"))) {
    console.error("vendor/kira is missing. It is a committed port; see vendor/kira/UPSTREAM.md.");
    process.exit(1);
  }
  if (hashDir(KIRA) !== kiraLock.contentHash) {
    console.error("vendor/kira does not match vendor/kira.lock.json. Review the edits, then run `node scripts/sync-anti-slop.ts --rehash-kira`.");
    process.exit(1);
  }
  console.log(`vendor/anti-slop OK (${lock.sha.slice(0, 12)}), vendor/kira OK (${kiraLock.sha.slice(0, 12)})`);
  process.exit(0);
}

if (values["rehash-kira"]) {
  const lock = existsSync(KIRA_LOCK) ? (JSON.parse(readFileSync(KIRA_LOCK, "utf8")) as Lock) : null;
  if (!lock || !existsSync(join(KIRA, "index.ts"))) {
    console.error("vendor/kira is missing; nothing to rehash.");
    process.exit(1);
  }
  const contentHash = hashDir(KIRA);
  writeFileSync(KIRA_LOCK, `${JSON.stringify({ ...lock, contentHash }, null, 2)}\n`);
  console.log(`Rehashed vendor/kira (${contentHash.slice(0, 12)}). Record the change in vendor/kira/UPSTREAM.md and add a changeset.`);
  process.exit(0);
}

const sha = values.head ? (git(["ls-remote", REPO, "HEAD"]).split(/\s+/)[0] ?? "") : (values.sha ?? readLock()?.sha ?? DEFAULT_SHA);
if (!/^[0-9a-f]{40}$/.test(sha)) {
  console.error(`Not a full commit SHA: "${sha}"`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "anti-slop-"));
try {
  git(["init", "-q"], tmp);
  git(["remote", "add", "origin", REPO], tmp);
  git(["fetch", "-q", "--depth", "1", "origin", sha], tmp);
  git(["checkout", "-q", "FETCH_HEAD"], tmp);
  const revision = git(["rev-parse", "HEAD"], tmp);
  if (revision !== sha) throw new Error(`Fetched ${revision} but expected ${sha}.`);

  // The upstream skill assets are the sanctioned vendoring set; src/ is the fallback.
  const source = [join(tmp, "skills", "install-anti-slop", "assets", "anti-slop"), join(tmp, "src")].find((dir) =>
    existsSync(join(dir, "index.ts")),
  );
  if (!source) throw new Error("Could not find the anti-slop rule sources upstream.");

  const previous = existsSync(VENDOR) ? hashDir(VENDOR) : null;
  rmSync(VENDOR, { recursive: true, force: true });
  cpSync(source, VENDOR, { recursive: true, filter: (path) => !path.endsWith(".test.ts") });
  const contentHash = hashDir(VENDOR);
  const lock: Lock = { repo: REPO, sha, contentHash };
  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);

  console.log(`Vendored anti-slop ${sha.slice(0, 12)} (hash ${contentHash.slice(0, 12)}).`);
  if (previous && previous !== contentHash) console.log("Content changed: review `git diff vendor/` and add a changeset.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
