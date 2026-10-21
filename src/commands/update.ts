import { defineCommand } from "citty";
import { isEmptyDiff } from "../core/diff";
import { install } from "../core/install";
import { projectPaths } from "../core/paths";
import { installedSettings } from "../core/state";
import { fail } from "../errors";
import { PKG_NAME } from "../meta";
import { PROFILE_IDS, PROFILES } from "../profiles";
import { confirmAction } from "../ui/prompts";
import { printChanges, printReport } from "../ui/report";
import { commonArgs, parseMode, parsePm, parseProfile, runCommand } from "./shared";

export const updateCommand = defineCommand({
  meta: { name: "update", description: "Regenerate presets and move to this CLI's tested versions and bundled anti-slop" },
  args: {
    ...commonArgs,
    profile: { type: "string", description: `Switch profile: ${PROFILE_IDS.join(", ")}` },
    mode: { type: "string", description: "Switch mode: adopt or strict" },
    latest: { type: "boolean", description: "Install the newest published versions instead of the tested set" },
    smoke: { type: "boolean", default: true, description: "Run the smoke test", negativeDescription: "Skip the smoke test" },
    "dry-run": { type: "boolean", description: "Print the plan without changing anything" },
    "allow-dirty": { type: "boolean", description: "Do not refuse on a dirty git working tree" },
    force: { type: "boolean", description: "Replace an edited or unrecognized tools/oxlint/anti-slop" },
  },
  async run({ args }) {
    await runCommand(args, async ({ root, log }) => {
      const current = installedSettings(projectPaths(root));
      if (!current) fail(`No existing setup found in ${root}. Run \`npx ${PKG_NAME} init\` first.`);
      if (current.source === "legacy") log.step("Found a setup created by install-lint.mjs; adopting it.");

      const profile = PROFILES[args.profile ? parseProfile(args.profile) : current.profile];
      const result = await install(
        {
          root,
          pm: parsePm(args.pm),
          profile,
          mode: args.mode ? parseMode(args.mode) : current.mode,
          prettier: current.prettier,
          baseline: current.baseline,
          smoke: args.smoke !== false,
          deps: args.latest ? "latest" : "compat",
          dryRun: Boolean(args["dry-run"]),
          allowDirty: Boolean(args["allow-dirty"]),
          force: Boolean(args.force),
          confirmChanges: async (changes) => {
            if (isEmptyDiff(changes.presets) && isEmptyDiff(changes.antiSlop) && changes.deps.toInstall.length === 0) {
              log.ok("Already up to date.");
              return true;
            }
            printChanges(log, changes);
            return confirmAction(log, "Apply these changes?", Boolean(args.yes));
          },
        },
        log,
      );
      printReport(result, log);
      return 0;
    });
  },
});
