import { describe, expect, it } from "vitest";
import { PKG_VERSION } from "../../src/meta";
import { PROFILE_IDS, PROFILES } from "../../src/profiles";
import { configImportsMatch, renderConfig } from "../../src/render/config";
import { presetRules, renderPreset, severity } from "../../src/render/preset";

const stable = (text: string) => text.replaceAll(PKG_VERSION, "<version>");

describe("severity", () => {
  it("keeps hard rules as errors in adopt mode", () => expect(severity("hard", "adopt")).toBe("error"));
  it("downgrades soft rules to warnings in adopt mode", () => expect(severity("soft", "adopt")).toBe("warn"));
  it("makes everything an error in strict mode", () => expect(severity("soft", "strict")).toBe("error"));
});

describe("presetRules", () => {
  it("adds no-ternary only for profiles that ask for it", () => {
    expect(presetRules("strict", PROFILES.ts, "adopt")).toHaveProperty(["eslint/no-ternary"]);
    expect(presetRules("strict", PROFILES["react-ts"], "adopt")).not.toHaveProperty(["eslint/no-ternary"]);
  });

  it("passes filename ignores to unicorn/filename-case", () => {
    expect(presetRules("base", PROFILES["react-ts"], "adopt")["unicorn/filename-case"]).toEqual([
      "warn",
      { cases: { kebabCase: true, pascalCase: true }, ignore: ["^__root", "^\\$", "^_"] },
    ]);
  });
});

describe("generated files", () => {
  for (const id of PROFILE_IDS) {
    const profile = PROFILES[id];
    it(`renders oxlint.config.ts for ${id}`, () => {
      const config = renderConfig(profile);
      expect(configImportsMatch(config, profile)).toBe(true);
      expect(config).toMatchSnapshot();
    });
    for (const mode of ["adopt", "strict"] as const) {
      for (const preset of profile.presets) {
        it(`renders ${preset} for ${id} (${mode})`, () => {
          expect(stable(renderPreset(preset, profile, mode))).toMatchSnapshot();
        });
      }
    }
  }
});
