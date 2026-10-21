import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJson } from "./fs";

export interface WorkspaceInfo {
  isWorkspaceRoot: boolean;
  parentRoot: string | null;
}

function declaresWorkspaces(dir: string): boolean {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
  return Boolean(readJson<{ workspaces?: unknown }>(join(dir, "package.json"))?.workspaces);
}

export function detectWorkspace(root: string): WorkspaceInfo {
  let parentRoot: string | null = null;
  let dir = dirname(root);
  for (;;) {
    if (declaresWorkspaces(dir)) {
      parentRoot = dir;
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { isWorkspaceRoot: declaresWorkspaces(root), parentRoot };
}
