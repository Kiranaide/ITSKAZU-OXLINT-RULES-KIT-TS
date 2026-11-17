import type { ESTree } from "@oxlint/plugins";

type ExpressionWrapper =
  | ESTree.ChainExpression
  | ESTree.ParenthesizedExpression
  | ESTree.TSNonNullExpression
  | ESTree.TSAsExpression
  | ESTree.TSTypeAssertion;

const asAstNode = (node: unknown): ESTree.Node | undefined =>
  typeof node === "object" && node !== null && "type" in node && typeof node.type === "string"
    ? (node as ESTree.Node)
    : undefined;

const isExpressionWrapper = (node: ESTree.Node): node is ExpressionWrapper =>
  node.type === "ChainExpression" ||
  node.type === "ParenthesizedExpression" ||
  node.type === "TSNonNullExpression" ||
  node.type === "TSAsExpression" ||
  node.type === "TSTypeAssertion";

export function unwrapExpression(node: unknown): ESTree.Node | undefined {
  let current = asAstNode(node);
  while (current !== undefined && isExpressionWrapper(current)) {
    current = asAstNode(current.expression);
  }
  return current;
}

export function getPropertyName(node: unknown): string | undefined {
  const expression = asAstNode(node);
  if (expression === undefined) return undefined;
  if (expression.type === "Identifier" && typeof expression.name === "string") return expression.name;
  if (expression.type === "PrivateIdentifier" && typeof expression.name === "string") {
    return expression.name;
  }
  if (expression.type === "Literal" && typeof expression.value === "string") return expression.value;
  return undefined;
}

export function isIdentifier(node: ESTree.Node | undefined, name?: string): boolean {
  return (
    node !== undefined &&
    node.type === "Identifier" &&
    typeof node.name === "string" &&
    (name === undefined || node.name === name)
  );
}