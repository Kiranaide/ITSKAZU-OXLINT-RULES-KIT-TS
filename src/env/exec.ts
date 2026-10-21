import spawn from "cross-spawn";
import { KitError } from "../errors";
import { lastLines } from "../util";

export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd: string;
  inherit?: boolean;
}

/** cross-spawn handles Windows .cmd shims and argument quoting without a shell. */
export function exec(cmd: string, args: readonly string[], options: ExecOptions): ExecResult {
  const result = spawn.sync(cmd, [...args], {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new KitError(`Could not run \`${cmd}\`: ${result.error.message}`);
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

export function execOrFail(cmd: string, args: readonly string[], options: ExecOptions): string {
  const result = exec(cmd, args, options);
  if (result.status !== 0) {
    throw new KitError(`\`${cmd} ${args.join(" ")}\` failed (exit ${result.status}).\n${lastLines(result.stderr || result.stdout, 15)}`);
  }
  return result.stdout;
}
