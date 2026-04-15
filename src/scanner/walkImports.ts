/**
 * walkImports — parse a single JS/TS source file and return all imported paths.
 * Uses @babel/parser for accurate AST parsing (handles JSX, TSX, decorators).
 * Only returns relative imports (starting with ".") — skips node_modules.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { parse, type ParseResult } from "@babel/parser";
import type { File } from "@babel/types";

const PARSEABLE_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const MAX_FILE_SIZE = 512_000; // 512 KB

type ASTNode = Record<string, unknown>;

/**
 * Walk an AST node tree and collect import/require string literals.
 * Avoids @babel/traverse to keep the dependency footprint minimal.
 */
function collectImportPaths(node: unknown, result: string[]): void {
  if (!node || typeof node !== "object") return;
  const n = node as ASTNode;
  const t = n["type"] as string | undefined;

  // import X from 'path' / import 'path'
  if (t === "ImportDeclaration" && typeof (n["source"] as ASTNode)?.["value"] === "string") {
    result.push((n["source"] as ASTNode)["value"] as string);
    return;
  }

  // export { X } from 'path' / export * from 'path'
  if (
    (t === "ExportNamedDeclaration" || t === "ExportAllDeclaration") &&
    n["source"] &&
    typeof (n["source"] as ASTNode)?.["value"] === "string"
  ) {
    result.push((n["source"] as ASTNode)["value"] as string);
  }

  // require('path') / require.resolve('path')
  if (t === "CallExpression") {
    const callee = n["callee"] as ASTNode | undefined;
    const args = n["arguments"] as ASTNode[] | undefined;
    const isRequire =
      callee?.["type"] === "Identifier" && callee?.["name"] === "require";
    const isRequireResolve =
      callee?.["type"] === "MemberExpression" &&
      (callee?.["object"] as ASTNode)?.["name"] === "require" &&
      (callee?.["property"] as ASTNode)?.["name"] === "resolve";
    if (
      (isRequire || isRequireResolve) &&
      args?.length &&
      args[0]["type"] === "StringLiteral"
    ) {
      result.push(args[0]["value"] as string);
    }
  }

  // Recurse into children (skip primitive leaves and position metadata)
  for (const key of Object.keys(n)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) collectImportPaths(item, result);
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      collectImportPaths(child, result);
    }
  }
}

/**
 * Parse one source file and return all relative import paths (as written).
 * Paths are NOT resolved — callers should resolve relative to the file's directory.
 */
export async function walkImports(absoluteFilePath: string): Promise<string[]> {
  const ext = path.extname(absoluteFilePath).toLowerCase();
  if (!PARSEABLE_EXTS.has(ext)) return [];

  let source: string;
  try {
    const stat = await fs.stat(absoluteFilePath);
    if (stat.size > MAX_FILE_SIZE) return [];
    source = await fs.readFile(absoluteFilePath, "utf8");
  } catch {
    return [];
  }

  let ast: ParseResult<File>;

  // Try TypeScript mode first (works for .ts, .tsx, and most .js files with modern syntax)
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
    });
  } catch {
    // Fallback: plain JS with error recovery
    try {
      ast = parse(source, {
        sourceType: "unambiguous",
        plugins: ["jsx"],
        errorRecovery: true,
      });
    } catch {
      return [];
    }
  }

  const rawPaths: string[] = [];
  collectImportPaths(ast.program, rawPaths);

  // Return only relative imports (. or ..)
  return rawPaths.filter((p) => p.startsWith("."));
}
