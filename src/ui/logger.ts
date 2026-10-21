import pc from "picocolors";

export interface LoggerOptions {
  quiet?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export interface Logger {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly interactive: boolean;
  step(message: string): void;
  info(message: string): void;
  ok(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  raw(text: string): void;
  result(data: unknown): void;
}

/**
 * Colors come from picocolors, which honors NO_COLOR / FORCE_COLOR and TTY detection.
 * In --json mode stdout carries exactly one JSON document; human output goes to stderr.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const json = Boolean(options.json);
  const quiet = Boolean(options.quiet);
  const verbose = Boolean(options.verbose);
  const human = (text: string) => (json ? process.stderr : process.stdout).write(`${text}\n`);
  const normal = (text: string) => {
    if (!quiet) human(text);
  };

  return {
    json,
    quiet,
    verbose,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI && !json,
    step: (m) => normal(`${pc.cyan("›")} ${m}`),
    info: (m) => normal(`  ${m}`),
    ok: (m) => normal(`${pc.green("✓")} ${m}`),
    warn: (m) => human(`${pc.yellow("⚠")} ${m}`),
    error: (m) => process.stderr.write(`${pc.red("✗")} ${m}\n`),
    debug: (m) => {
      if (verbose) human(pc.dim(m));
    },
    raw: (t) => normal(t),
    result: (data) => {
      if (json) process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    },
  };
}
