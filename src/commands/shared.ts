import type { ArgsDef } from "citty";
import { resolve } from "node:path";
import { isPackageManager, PACKAGE_MANAGERS, type PackageManager } from "../env/pm";
import { CancelledError, fail, KitError } from "../errors";
import { isProfileId, PROFILE_IDS, type ProfileId } from "../profiles";
import { isMode, type Mode } from "../rules";
import { createLogger, type Logger } from "../ui/logger";

export const commonArgs = {
  cwd: { type: "string", description: "Project root (default: current directory)" },
  json: { type: "boolean", description: "Print one machine-readable JSON result to stdout" },
  quiet: { type: "boolean", description: "Only print warnings and errors" },
  verbose: { type: "boolean", description: "Print extra detail" },
  yes: { type: "boolean", alias: "y", description: "Skip the wizard and answer yes to confirmations" },
  pm: { type: "string", description: `Override package manager detection (${PACKAGE_MANAGERS.join(", ")})` },
} satisfies ArgsDef;

export interface CommandContext {
  root: string;
  log: Logger;
}

interface CommonValues {
  cwd?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

/** Runs a command body with a logger, mapping KitError to a clean message and exit code. */
export async function runCommand(args: CommonValues, body: (ctx: CommandContext) => Promise<number>): Promise<void> {
  const log = createLogger({ json: args.json, quiet: args.quiet, verbose: args.verbose });
  const root = resolve(args.cwd || process.cwd());
  try {
    process.exitCode = await body({ root, log });
  } catch (error) {
    if (!(error instanceof KitError)) throw error;
    log.error(error.message);
    log.result({ ok: false, error: error.message });
    process.exitCode = error instanceof CancelledError ? 130 : 1;
  }
}

/** True when the flag (or its --no- form) was passed explicitly. */
export const flagGiven = (rawArgs: readonly string[], name: string): boolean =>
  rawArgs.some((a) => a === `--${name}` || a === `--no-${name}` || a.startsWith(`--${name}=`));

export function parseProfile(value: string): ProfileId {
  if (!isProfileId(value)) fail(`Unknown profile "${value}". Available: ${PROFILE_IDS.join(", ")}.`);
  return value;
}

export function parseMode(value: string): Mode {
  if (!isMode(value)) fail(`Unknown mode "${value}". Use adopt or strict.`);
  return value;
}

export function parsePm(value: string | undefined): PackageManager | undefined {
  if (!value) return undefined;
  if (!isPackageManager(value)) fail(`Unknown package manager "${value}". Use ${PACKAGE_MANAGERS.join(", ")}.`);
  return value;
}
