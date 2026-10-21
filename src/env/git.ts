import { exec } from "./exec";

export function gitStatus(root: string): { isRepo: boolean; dirty: string[] } {
  try {
    const inside = exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root });
    if (inside.status !== 0 || inside.stdout.trim() !== "true") return { isRepo: false, dirty: [] };
    const status = exec("git", ["status", "--porcelain"], { cwd: root });
    return { isRepo: true, dirty: status.stdout.split("\n").filter((line) => line.trim()) };
  } catch {
    return { isRepo: false, dirty: [] };
  }
}
