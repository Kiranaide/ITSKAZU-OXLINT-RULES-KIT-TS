import type { Environment } from "../env/detect";
import { TS_PAIR } from "../env/typescript";
import type { Logger } from "../ui/logger";
import { confirmAction } from "../ui/prompts";

export type TsAction =
  | { kind: "nothing" }
  | { kind: "install-pair" } // add the TS 6 API + TS 7 compiler alias pair
  | { kind: "fallback-wrapper" } // sonarjs through a require-shim instead of the alias
  | { kind: "blocked" }; // override trap: refuse before installing anything

export interface TsDecision {
  action: TsAction;
  /** What the user was asked (for notes/report), empty when nothing was asked. */
  asked?: string;
  note?: string;
}

/**
 * native-plain is the only state that breaks sonarjs (its require("typescript") reads
 * TypeFlags at module load). tsgolint bundles its own compiler and is TS-agnostic,
 * so type-aware linting never depends on this decision.
 */
export function planTsAction(env: Environment, wantsSonar: boolean): TsDecision {
  if (env.tsOverrides.length && wantsSonar) {
    return {
      action: { kind: "blocked" },
      note: `package.json pins typescript via ${env.tsOverrides.join("; ")}. That override defeats the TS 6 API alias, so eslint-plugin-sonarjs would crash on TypeScript 7. Remove the override or drop the sonar preset, then re-run.`,
    };
  }

  switch (env.tsState) {
    case "aliased":
      return { action: { kind: "nothing" } };
    case "legacy":
      // sonarjs declares typescript ">=5 <6.1.0": TS 5/6 works as-is.
      return { action: { kind: "nothing" } };
    case "none":
      return wantsSonar
        ? { action: { kind: "nothing" }, note: "No TypeScript dependency found. Type-aware linting still works (oxlint-tsgolint bundles its own compiler); install TypeScript for `typecheck`." }
        : { action: { kind: "nothing" } };
    case "native-plain":
      if (!wantsSonar) {
        return { action: { kind: "nothing" }, note: "TypeScript 7 detected without a sonarjs preset: no alias needed." };
      }
      return { action: { kind: "install-pair" }, asked: "TypeScript 7 is installed, but eslint-plugin-sonarjs crashes on it (no JS compiler API). Add the TS 6 API alias pair?" };
  }
}

export const tsPairSpecs = (): string[] => [...TS_PAIR];

/**
 * Asks before touching the typescript dependency (native-plain + sonar preset only).
 * Declined or non-interactive: fall back to the require-shim wrapper, which is
 * config-only and safe to apply silently.
 */
export async function resolveTsDecision(env: Environment, wantsSonar: boolean, log: Logger, ask: boolean): Promise<TsDecision> {
  const planned = planTsAction(env, wantsSonar);
  if (planned.action.kind !== "install-pair") return planned;

  if (ask) {
    const yes = await confirmAction(log, planned.asked ?? "Add the TypeScript 6 API alias pair?", false);
    if (yes) return planned;
    log.info("Keeping plain TypeScript 7. SonarJS will load through a TS 6 API shim instead (tools/oxlint/sonarjs-ts6.cjs).");
    return { action: { kind: "fallback-wrapper" } };
  }
  log.warn("Non-interactive install on plain TypeScript 7: using the sonarjs TS 6 API shim instead of rewriting the typescript dependency. Re-run oxlint-kit to switch to the alias pair.");
  return { action: { kind: "fallback-wrapper" } };
}
