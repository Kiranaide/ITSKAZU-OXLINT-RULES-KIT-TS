import * as p from "@clack/prompts";
import { CancelledError } from "../errors";
import type { Logger } from "./logger";

export function unwrap<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    throw new CancelledError("Cancelled. Nothing was changed.");
  }
  return value as T;
}

export async function confirmAction(log: Logger, message: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!log.interactive) {
    log.warn(`${message} Not an interactive terminal: pass --yes to proceed.`);
    return false;
  }
  return unwrap(await p.confirm({ message, initialValue: true }));
}
