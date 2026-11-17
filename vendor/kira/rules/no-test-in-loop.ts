import { defineRule, type ESTree } from "@oxlint/plugins";

import { getPropertyName, unwrapExpression } from "../utils.ts";

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
// node:test has no `.each`, so files written against it keep their loops.
const NODE_TEST_IMPORT_PATTERN = /["']node:test["']/u;
const TEST_FUNCTIONS = new Set(["describe", "it", "suite", "test"]);
const EACH_CAPABLE_MODIFIERS = new Set(["effect", "live"]);
const LOOPS = new Set(["ForStatement", "ForInStatement", "ForOfStatement"]);
const FUNCTIONS = new Set(["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"]);

const testCallName = (callee: unknown): string | undefined => {
  const expression = unwrapExpression(callee);
  if (expression === undefined) return undefined;

  if (expression.type === "Identifier") {
    return TEST_FUNCTIONS.has(expression.name) ? expression.name : undefined;
  }

  if (expression.type !== "MemberExpression") return undefined;
  const object = unwrapExpression(expression.object);
  const property = getPropertyName(expression.property);
  if (object === undefined || property === undefined) return undefined;
  if (!EACH_CAPABLE_MODIFIERS.has(property)) return undefined;
  if (object.type !== "Identifier" || !TEST_FUNCTIONS.has(object.name)) return undefined;
  return `${object.name}.${property}`;
};

const isInsideLoop = (node: ESTree.Node): boolean => {
  let current = node.parent;
  while (current) {
    if (LOOPS.has(current.type)) return true;
    if (FUNCTIONS.has(current.type)) return false;
    current = current.parent;
  }
  return false;
};

export default defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow declaring tests inside a for loop; use .each instead.",
    },
  },
  create(context) {
    if (!TEST_FILE_PATTERN.test(context.filename)) return {};
    if (NODE_TEST_IMPORT_PATTERN.test(context.sourceCode.text)) return {};

    return {
      CallExpression(node) {
        const name = testCallName(node.callee);
        if (name === undefined) return;
        if (!isInsideLoop(node)) return;

        context.report({
          node: node.callee,
          message: `Do not call ${name}(…) inside a for loop. Use ${name}.each(cases)(name, …) instead.`,
        });
      },
    };
  },
});