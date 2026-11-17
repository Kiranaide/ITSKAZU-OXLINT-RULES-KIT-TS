import { definePlugin } from "@oxlint/plugins";

import noLowValueComments from "./rules/no-low-value-comments.ts";
import noTestInLoop from "./rules/no-test-in-loop.ts";
import noTestTimeoutOrUnreasonedSkip from "./rules/no-test-timeout-or-unreasoned-skip.ts";
import noWallClockInTests from "./rules/no-wall-clock-in-tests.ts";
import requireSuppressionReason from "./rules/require-suppression-reason.ts";

/** Curated comment- and test-hygiene rules ported from Kiranaide/t3-kira (oxlint-plugin-t3code). */
export default definePlugin({
  meta: {
    name: "kira",
  },
  rules: {
    "no-low-value-comments": noLowValueComments,
    "no-test-in-loop": noTestInLoop,
    "no-test-timeout-or-unreasoned-skip": noTestTimeoutOrUnreasonedSkip,
    "no-wall-clock-in-tests": noWallClockInTests,
    "require-suppression-reason": requireSuppressionReason,
  },
});