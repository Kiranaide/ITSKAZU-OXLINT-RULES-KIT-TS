const START = "# >>> oxlint-kit (managed)";
const END = "# <<< oxlint-kit";
// Also matches blocks written by the original install-lint.mjs.
const ANY_BLOCK = /# >>> (?:install-lint\.mjs|oxlint-kit) \(managed\)[\s\S]*?# <<< (?:install-lint\.mjs|oxlint-kit)\n?/;
const ENTRIES = ["tools/oxlint/", "oxlint-kit-staging/", ".oxlint-kit-backup/", "dist/", "build/", "coverage/"];

export const hasManagedBlock = (text: string): boolean => ANY_BLOCK.test(text);

export function renderPrettierIgnore(current: string): string {
  const block = `${START}\n${ENTRIES.join("\n")}\n${END}\n`;
  if (ANY_BLOCK.test(current)) return current.replace(ANY_BLOCK, block);
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  return `${current}${separator}${block}`;
}
