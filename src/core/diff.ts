import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "./hash";

export interface DirDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffDirs(current: string, next: string): DirDiff {
  const before = new Set(existsSync(current) ? listFiles(current) : []);
  const after = new Set(listFiles(next));
  const diff: DirDiff = { added: [], removed: [], changed: [] };
  for (const file of after) {
    if (!before.has(file)) diff.added.push(file);
    else if (!readFileSync(join(current, file)).equals(readFileSync(join(next, file)))) diff.changed.push(file);
  }
  for (const file of before) if (!after.has(file)) diff.removed.push(file);
  return diff;
}

export const isEmptyDiff = (diff: DirDiff): boolean =>
  diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
