import { defineRule, type ESTree } from "@oxlint/plugins";

import { getPropertyName, isIdentifier, unwrapExpression } from "../utils.ts";

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const WALL_CLOCK_CALLS = new Set([
  "Date.now",
  "performance.now",
  "process.hrtime",
  "process.hrtime.bigint",
]);
const VI_MOCKING_FUNCTIONS = new Set(["fn", "mock", "setSystemTime", "spyOn"]);
const MOCK_METHODS = new Set([
  "mockImplementation",
  "mockImplementationOnce",
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockReturnValue",
  "mockReturnValueOnce",
]);

const MESSAGE =
  "Wall-clock reading in a test; elapsed-time assertions pass or fail with runner load. Use fake timers (`vi.useFakeTimers`/`vi.setSystemTime`), a fixed epoch, or await the milestone instead.";

const isStringLiteral = (node: unknown): boolean => {
  const expression = unwrapExpression(node);
  return expression !== undefined && expression.type === "Literal" && typeof expression.value === "string";
};

const memberPath = (node: unknown): string[] | undefined => {
  const expression = unwrapExpression(node);
  if (expression === undefined) return undefined;
  if (expression.type === "Identifier") return [expression.name];
  if (expression.type !== "MemberExpression") return undefined;
  // `Date[now]` with a variable key is unknowable; only a literal key names a member.
  if (expression.computed && !isStringLiteral(expression.property)) return undefined;
  const property = getPropertyName(expression.property);
  if (property === undefined) return undefined;
  const objectPath = memberPath(expression.object);
  return objectPath === undefined ? undefined : [...objectPath, property];
};

const isWallClockCall = (callee: unknown): boolean => {
  const path = memberPath(callee);
  return path !== undefined && WALL_CLOCK_CALLS.has(path.join("."));
};

const isMockingCall = (callee: unknown): boolean => {
  const expression = unwrapExpression(callee);
  if (expression === undefined || expression.type !== "MemberExpression") return false;
  const property = getPropertyName(expression.property);
  if (property === undefined) return false;
  if (MOCK_METHODS.has(property)) return true;
  return VI_MOCKING_FUNCTIONS.has(property) && isIdentifier(unwrapExpression(expression.object), "vi");
};

// Readings that feed a mock (or live in a vi.mock factory) seed fake time
// rather than measure the runner, so they stay allowed.
const isMockArgument = (node: ESTree.Node): boolean => {
  let child: ESTree.Node = node;
  let current = node.parent;
  while (current) {
    if (
      current.type === "CallExpression" &&
      current.callee !== child &&
      isMockingCall(current.callee)
    ) {
      return true;
    }
    child = current;
    current = current.parent;
  }
  return false;
};

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow wall-clock readings (Date.now, new Date(), performance.now, process.hrtime) in tests.",
    },
  },
  create(context) {
    if (!TEST_FILE_PATTERN.test(context.filename)) return {};

    return {
      CallExpression(node) {
        if (!isWallClockCall(node.callee)) return;
        if (isMockArgument(node)) return;
        context.report({ node, message: MESSAGE });
      },
      NewExpression(node) {
        if (node.arguments.length > 0) return;
        if (!isIdentifier(unwrapExpression(node.callee), "Date")) return;
        if (isMockArgument(node)) return;
        context.report({ node, message: MESSAGE });
      },
    };
  },
});