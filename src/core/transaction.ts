import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Applies writes with an undo log, so a failure mid-apply restores the previous files. */
export class Transaction {
  readonly #undo: (() => void)[] = [];
  readonly #cleanup: (() => void)[] = [];

  writeFile(path: string, content: string | Buffer): void {
    const previous = existsSync(path) ? readFileSync(path) : null;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    this.#undo.push(() => {
      if (previous === null) rmSync(path, { force: true });
      else writeFileSync(path, previous);
    });
  }

  removeFile(path: string): void {
    if (!existsSync(path)) return;
    const previous = readFileSync(path);
    rmSync(path, { force: true });
    this.#undo.push(() => writeFileSync(path, previous));
  }

  replaceDir(staged: string, target: string): void {
    const old = `${target}.old`;
    rmSync(old, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    const hadTarget = existsSync(target);
    if (hadTarget) renameSync(target, old);
    renameSync(staged, target);
    this.#undo.push(() => {
      rmSync(target, { recursive: true, force: true });
      if (hadTarget) renameSync(old, target);
    });
    this.#cleanup.push(() => rmSync(old, { recursive: true, force: true }));
  }

  commit(): void {
    for (const fn of this.#cleanup) fn();
    this.#undo.length = 0;
    this.#cleanup.length = 0;
  }

  /** Returns errors from undo steps that could not be applied. */
  rollback(): string[] {
    const errors: string[] = [];
    for (const fn of this.#undo.reverse()) {
      try {
        fn();
      } catch (error) {
        errors.push(String(error));
      }
    }
    this.#undo.length = 0;
    this.#cleanup.length = 0;
    return errors;
  }
}
