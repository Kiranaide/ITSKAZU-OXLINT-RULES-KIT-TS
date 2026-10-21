import { describe, expect, it } from "vitest";
import { planScripts, withScripts } from "../../src/core/plan";

describe("planScripts", () => {
  it("keeps scripts the project already defines", () => {
    const { add, keep } = planScripts({ lint: "eslint ." }, { prettier: false, baseline: false });
    const names = add.map(([name]) => name);
    expect(keep).toEqual(["lint"]);
    expect(names).not.toContain("lint");
    expect(names).not.toContain("format");
  });

  it("adds baseline scripts when enabled", () => {
    const names = planScripts({}, { prettier: true, baseline: true }).add.map(([name]) => name);
    expect(names).toEqual(expect.arrayContaining(["lint:ci", "lint:baseline", "format"]));
  });
});

describe("withScripts", () => {
  it("preserves tab indentation", () => {
    expect(withScripts('{\n\t"name": "x"\n}\n', [["lint", "oxlint"]])).toBe(
      '{\n\t"name": "x",\n\t"scripts": {\n\t\t"lint": "oxlint"\n\t}\n}\n',
    );
  });
});
