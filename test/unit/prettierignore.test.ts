import { describe, expect, it } from "vitest";
import { renderPrettierIgnore } from "../../src/render/prettierignore";

describe("renderPrettierIgnore", () => {
  it("appends a managed block", () => {
    expect(renderPrettierIgnore("node_modules\n").startsWith("node_modules\n# >>> oxlint-kit (managed)")).toBe(true);
  });

  it("adds a newline before the block when missing", () => {
    expect(renderPrettierIgnore("node_modules").startsWith("node_modules\n# >>>")).toBe(true);
  });

  it("replaces a legacy install-lint.mjs block", () => {
    const out = renderPrettierIgnore("dist\n# >>> install-lint.mjs (managed)\ntools/oxlint/\n# <<< install-lint.mjs\n");
    expect(out).not.toContain("install-lint.mjs");
    expect(out.startsWith("dist\n# >>> oxlint-kit (managed)")).toBe(true);
  });

  it("is idempotent", () => {
    const once = renderPrettierIgnore("");
    expect(renderPrettierIgnore(once)).toBe(once);
  });
});
