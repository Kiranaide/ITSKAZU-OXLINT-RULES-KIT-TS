import * as p from "@clack/prompts";
import { defineCommand } from "citty";
import { join } from "node:path";
import { install } from "../core/install";
import type { PackageJson } from "../env/detect";
import { readJson } from "../env/fs";
import { PKG_NAME } from "../meta";
import { detectProfile, PROFILE_IDS, PROFILES, type Profile, type ProfileId } from "../profiles";
import type { Mode } from "../rules";
import type { Logger } from "../ui/logger";
import { confirmAction, unwrap } from "../ui/prompts";
import { printReport } from "../ui/report";
import { commonArgs, flagGiven, parseMode, parsePm, parseProfile, runCommand } from "./shared";

interface Settings {
  profile: Profile;
  mode: Mode;
  prettier: boolean;
  baseline: boolean;
}

interface InitFlags {
  profile?: string;
  mode?: string;
  prettier?: boolean;
  baseline?: boolean;
  yes?: boolean;
}

async function resolveSettings(root: string, log: Logger, args: InitFlags, rawArgs: string[]): Promise<Settings> {
  const detected = detectProfile(readJson<PackageJson>(join(root, "package.json")));
  let profileId: ProfileId | undefined = args.profile ? parseProfile(args.profile) : undefined;
  let mode: Mode | undefined = args.mode ? parseMode(args.mode) : undefined;
  let prettier = flagGiven(rawArgs, "prettier") ? Boolean(args.prettier) : undefined;
  let baseline = flagGiven(rawArgs, "baseline") ? Boolean(args.baseline) : undefined;

  if (log.interactive && !args.yes) {
    p.intro(`${PKG_NAME} init`);
    profileId ??= unwrap(
      await p.select({
        message: "Which profile fits this project?",
        initialValue: detected,
        options: PROFILE_IDS.map((id) => ({
          value: id,
          label: PROFILES[id].label,
          hint: id === detected ? `detected · ${PROFILES[id].hint}` : PROFILES[id].hint,
        })),
      }),
    );
    mode ??= unwrap(
      await p.select({
        message: "How strict should it start?",
        initialValue: "adopt" as Mode,
        options: [
          { value: "adopt" as Mode, label: "adopt", hint: "bugs/security error, style and complexity warn" },
          { value: "strict" as Mode, label: "strict", hint: "everything errors" },
        ],
      }),
    );
    prettier ??= unwrap(await p.confirm({ message: "Install Prettier with format scripts?", initialValue: true }));
    baseline ??= unwrap(
      await p.confirm({ message: "Record a baseline of existing violations, so CI fails only on new ones?", initialValue: false }),
    );
  } else if (!profileId) {
    log.info(`No --profile given; detected "${detected}".`);
  }

  return {
    profile: PROFILES[profileId ?? detected],
    mode: mode ?? "adopt",
    prettier: prettier ?? true,
    baseline: baseline ?? false,
  };
}

export const initCommand = defineCommand({
  meta: { name: "init", description: "Set up Oxlint presets in this project" },
  args: {
    ...commonArgs,
    profile: { type: "string", description: `Rule profile: ${PROFILE_IDS.join(", ")} (default: detected)` },
    mode: { type: "string", description: "adopt (style rules warn) or strict (everything errors)" },
    prettier: { type: "boolean", description: "Install Prettier, format scripts and .prettierignore", negativeDescription: "Skip Prettier" },
    baseline: { type: "boolean", description: "Record existing violations so CI fails only on new ones" },
    smoke: { type: "boolean", default: true, description: "Run the post-install smoke test", negativeDescription: "Skip the smoke test" },
    "dry-run": { type: "boolean", description: "Print the plan without changing anything" },
    "allow-dirty": { type: "boolean", description: "Do not refuse on a dirty git working tree" },
    force: { type: "boolean", description: "Replace an edited or unrecognized tools/oxlint/anti-slop" },
  },
  async run({ args, rawArgs }) {
    await runCommand(args, async ({ root, log }) => {
      const settings = await resolveSettings(root, log, args, rawArgs);
      const askFirst = log.interactive && !args.yes && !args["dry-run"];
      const result = await install(
        {
          root,
          pm: parsePm(args.pm),
          ...settings,
          smoke: args.smoke !== false,
          deps: "keep",
          dryRun: Boolean(args["dry-run"]),
          allowDirty: Boolean(args["allow-dirty"]),
          force: Boolean(args.force),
          confirmPlan: askFirst ? () => confirmAction(log, "Apply these changes?", false) : undefined,
        },
        log,
      );
      printReport(result, log);
      return 0;
    });
  },
});
