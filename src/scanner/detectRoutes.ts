/**
 * detectRoutes — parse source files and extract real HTTP route registrations.
 *
 * Supports:
 *   - Express / Hono / Koa: app.get('/path', handler), router.use('/path', sub)
 *   - Fastify: fastify.get('/path', handler), fastify.route({method, url})
 *   - NestJS: @Controller('/base') class + @Get('/sub') method decorator combos
 *   - File-system routing hint (Remix/Next.js) derived from directory structure
 *
 * Every result points back to a real file and line — no narration.
 */
import fsPromises from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import { parse } from "@babel/parser";

export type HttpMethod =
  | "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  | "HEAD" | "OPTIONS" | "ALL" | "USE";

export type DetectedRoute = {
  method: HttpMethod;
  /** Route path as written in code, e.g. '/api/users/:id' */
  path: string;
  /** Relative path from system root to the file containing this registration */
  file: string;
  /** 1-based line number */
  line: number;
  /** Named handler function / method if identifiable */
  handlerName?: string;
  /** Framework this was detected from */
  framework: "express" | "fastify" | "nestjs" | "hono" | "koa" | "unknown";
  /** 0–1 */
  confidence: number;
};

// ── Constants ─────────────────────────────────────────────────────────

const HTTP_METHODS_LC = new Set(["get","post","put","patch","delete","head","options","all"]);
const USE_METHODS_LC  = new Set(["use","route"]);
const ALL_ROUTE_METHODS_LC = new Set([...HTTP_METHODS_LC, ...USE_METHODS_LC]);

const SKIP_DIRS = new Set([
  "node_modules",".git","dist","build","out",".next",".turbo","coverage",
  "__pycache__",".cache","test","tests","__tests__","e2e","spec","__mocks__",
  "fixtures","examples","example","demo","demos","sample","samples",
  "benchmark","benchmarks","bench","perf","__snapshots__","__stories__",
  "storybook-static",
]);

const SOURCE_EXTS = new Set([".js",".jsx",".ts",".tsx",".mjs",".cjs"]);
const MAX_FILE_SIZE = 512_000;
const MAX_FILES = 400;

// ── AST helpers ───────────────────────────────────────────────────────

type ASTNode = Record<string, unknown>;

function str(n: unknown): string | undefined {
  if (!n || typeof n !== "object") return undefined;
  const o = n as ASTNode;
  if (o["type"] === "StringLiteral") return o["value"] as string;
  if (o["type"] === "TemplateLiteral") {
    // static template literals like `/api/users`
    const quasis = (o["quasis"] as ASTNode[]) ?? [];
    if (quasis.length === 1) return (quasis[0]["value"] as ASTNode)?.["cooked"] as string;
  }
  return undefined;
}

function lineNum(n: ASTNode): number {
  const loc = n["loc"] as ASTNode | undefined;
  const start = loc?.["start"] as ASTNode | undefined;
  // loc.start is { line, column } — not a number
  return (start?.["line"] as number) ?? 0;
}

/** Join route path segments, normalizing slashes cleanly */
function joinPath(base: string, sub: string): string {
  const b = base.replace(/\/+$/, "");
  const s = sub.replace(/^\/+/, "");
  if (!b && !s) return "/";
  if (!s) return b || "/";
  if (!b) return "/" + s;
  return b + "/" + s;
}

function methodName(n: ASTNode): string | undefined {
  const prop = n["property"] as ASTNode | undefined;
  if (!prop) return undefined;
  return (prop["name"] as string) ?? (prop["value"] as string);
}

function handlerName(args: ASTNode[]): string | undefined {
  // Last handler arg — if it's a named function or identifier, extract the name
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (!a) continue;
    if (a["type"] === "Identifier") return a["name"] as string;
    if (a["type"] === "FunctionDeclaration" || a["type"] === "FunctionExpression") {
      const id = a["id"] as ASTNode | undefined;
      if (id) return id["name"] as string;
    }
    if (a["type"] === "ArrowFunctionExpression") return undefined; // anonymous
  }
  return undefined;
}

// ── Express / Hono / Koa / Fastify route detection ────────────────────

function collectExpressRoutes(
  node: unknown,
  file: string,
  routes: DetectedRoute[]
): void {
  if (!node || typeof node !== "object") return;
  const n = node as ASTNode;

  if (n["type"] === "CallExpression") {
    const callee = n["callee"] as ASTNode | undefined;
    const args   = (n["arguments"] as ASTNode[]) ?? [];

    if (callee?.["type"] === "MemberExpression") {
      const meth = methodName(callee)?.toLowerCase();

      // app.get('/path', ...) / router.post('/path', ...) pattern
      if (meth && HTTP_METHODS_LC.has(meth) && args.length >= 2) {
        const routePath = str(args[0]);
        if (routePath?.startsWith("/")) {
          routes.push({
            method: meth.toUpperCase() as HttpMethod,
            path: routePath,
            file,
            line: lineNum(n),
            handlerName: handlerName(args.slice(1)),
            framework: "express",
            confidence: 0.9,
          });
        }
      }

      // app.use('/path', ...) — mount prefix
      if (meth === "use" && args.length >= 2) {
        const routePath = str(args[0]);
        if (routePath?.startsWith("/")) {
          routes.push({
            method: "USE",
            path: routePath,
            file,
            line: lineNum(n),
            framework: "express",
            confidence: 0.75,
          });
        }
      }

      // fastify.route({method, url}) object form
      if (meth === "route" && args.length === 1 && args[0]["type"] === "ObjectExpression") {
        const props = (args[0]["properties"] as ASTNode[]) ?? [];
        let routeMethod: string | undefined;
        let routePath: string | undefined;
        for (const p of props) {
          const key = ((p["key"] as ASTNode)?.["name"] as string)?.toLowerCase();
          if (key === "method" || key === "methods") {
            const v = p["value"] as ASTNode;
            if (v?.["type"] === "StringLiteral") routeMethod = v["value"] as string;
            if (v?.["type"] === "ArrayExpression") {
              const el0 = (v["elements"] as ASTNode[])?.[0];
              if (el0?.["type"] === "StringLiteral") routeMethod = el0["value"] as string;
            }
          }
          if (key === "url" || key === "path") {
            routePath = str(p["value"]);
          }
        }
        if (routeMethod && routePath?.startsWith("/")) {
          routes.push({
            method: routeMethod.toUpperCase() as HttpMethod,
            path: routePath,
            file,
            line: lineNum(n),
            framework: "fastify",
            confidence: 0.95,
          });
        }
      }
    }
  }

  // Recurse
  for (const key of Object.keys(n)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) collectExpressRoutes(item, file, routes);
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      collectExpressRoutes(child, file, routes);
    }
  }
}

// ── NestJS controller + method decorator detection ────────────────────

type NestControllerDef = {
  classBasePath: string; // from @Controller('/base')
  file: string;
  line: number;
  methods: Array<{
    httpMethod: string;
    subPath: string;
    line: number;
    methodName: string;
  }>;
};

function decoratorPath(decorator: ASTNode): string | undefined {
  // @Controller() or @Controller('/path') or @Controller({path:'/path'}) or @Get('/path')
  const expr = decorator["expression"] as ASTNode | undefined;
  if (!expr) return undefined;
  if (expr["type"] === "Identifier") return "/"; // @Controller() with no arg → root
  if (expr["type"] === "CallExpression") {
    const args = (expr["arguments"] as ASTNode[]) ?? [];
    if (args.length === 0) return "/";
    const firstArg = args[0];
    // @Controller('/path') — string
    const strVal = str(firstArg);
    if (strVal !== undefined) return strVal;
    // @Controller({path: '/path', host: '...'}) — object
    if (firstArg["type"] === "ObjectExpression") {
      const props = (firstArg["properties"] as ASTNode[]) ?? [];
      for (const p of props) {
        const key = ((p["key"] as ASTNode)?.["name"] as string)?.toLowerCase();
        if (key === "path") {
          return str(p["value"]) ?? "/";
        }
      }
      return "/"; // object form without path → root
    }
    return "/";
  }
  return undefined;
}

function decoratorName(decorator: ASTNode): string | undefined {
  const expr = decorator["expression"] as ASTNode | undefined;
  if (!expr) return undefined;
  if (expr["type"] === "Identifier") return expr["name"] as string;
  if (expr["type"] === "CallExpression") {
    const callee = expr["callee"] as ASTNode | undefined;
    if (callee?.["type"] === "Identifier") return callee["name"] as string;
  }
  return undefined;
}

const NEST_HTTP_DECORATORS = new Map([
  ["Get","GET"],["Post","POST"],["Put","PUT"],["Patch","PATCH"],
  ["Delete","DELETE"],["Head","HEAD"],["Options","OPTIONS"],["All","ALL"],
]);

function collectNestRoutes(
  ast: ASTNode,
  file: string,
  routes: DetectedRoute[]
): void {
  const body = (ast["body"] as ASTNode[]) ?? [];
  const classNodes: ASTNode[] = [];

  for (const stmt of body) {
    // export class Foo / export default class Foo
    if (stmt["type"] === "ExportNamedDeclaration" || stmt["type"] === "ExportDefaultDeclaration") {
      const decl = stmt["declaration"] as ASTNode | undefined;
      if (decl && (decl["type"] === "ClassDeclaration" || decl["type"] === "ClassExpression")) {
        classNodes.push(decl);
      }
    } else if (stmt["type"] === "ClassDeclaration" || stmt["type"] === "ClassExpression") {
      classNodes.push(stmt);
    }
  }

  for (const stmt of classNodes) {

    const classDecorators = (stmt["decorators"] as ASTNode[]) ?? [];
    const controllerDec = classDecorators.find(
      (d) => decoratorName(d) === "Controller"
    );
    if (!controllerDec) continue;

    const rawBase = decoratorPath(controllerDec) ?? "/";
    const basePath = "/" + rawBase.replace(/^\/+|\/+$/g, ""); // always starts with /
    const classLine = lineNum(stmt);

    const classBody = (stmt["body"] as ASTNode | undefined)?.["body"] as ASTNode[] ?? [];
    for (const member of classBody) {
      if (member["type"] !== "ClassMethod" && member["type"] !== "ClassProperty") continue;
      const memberDecorators = (member["decorators"] as ASTNode[]) ?? [];

      for (const dec of memberDecorators) {
        const name = decoratorName(dec);
        if (!name) continue;
        const httpMethod = NEST_HTTP_DECORATORS.get(name);
        if (!httpMethod) continue;

        const subPath = decoratorPath(dec) ?? "";
        const fullPath = joinPath(basePath, subPath);
        const memberLine = lineNum(member) || classLine;
        const methodKey = member["key"] as ASTNode | undefined;
        const mName = methodKey?.["name"] as string | undefined;

        routes.push({
          method: httpMethod as HttpMethod,
          path: fullPath,
          file,
          line: memberLine,
          handlerName: mName,
          framework: "nestjs",
          confidence: 0.95,
        });
      }
    }
  }
}

// ── Per-file parser ───────────────────────────────────────────────────

async function parseFileForRoutes(
  absPath: string,
  relPath: string
): Promise<DetectedRoute[]> {
  let source: string;
  try {
    const stat = await fsPromises.stat(absPath);
    if (stat.size > MAX_FILE_SIZE) return [];
    source = await fsPromises.readFile(absPath, "utf8");
  } catch {
    return [];
  }

  // Quick bailout — skip files with no recognizable route pattern (fast pre-filter)
  if (
    !/.(?:get|post|put|patch|delete|use|route|Route|Controller|Get|Post|Put|Patch|Delete)\s*\(/.test(source)
  ) return [];

  let ast: { program: ASTNode } | undefined;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx", "decorators-legacy"],
      errorRecovery: true,
    }) as unknown as { program: ASTNode };
  } catch {
    try {
      ast = parse(source, {
        sourceType: "unambiguous",
        plugins: ["jsx"],
        errorRecovery: true,
      }) as unknown as { program: ASTNode };
    } catch {
      return [];
    }
  }

  const routes: DetectedRoute[] = [];
  collectExpressRoutes(ast.program, relPath, routes);
  collectNestRoutes(ast.program, relPath, routes);

  return routes;
}

// ── Directory walker ──────────────────────────────────────────────────

async function collectSourceFiles(dir: string): Promise<string[]> {
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    if (result.length >= MAX_FILES) return;
    let entries: Dirent[];
    try { entries = await fsPromises.readdir(current, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (result.length >= MAX_FILES) break;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(path.join(current, entry.name));
      } else {
        if (SOURCE_EXTS.has(path.extname(entry.name).toLowerCase())) {
          result.push(path.join(current, entry.name));
        }
      }
    }
  }

  await walk(dir);
  return result;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Scan all source files in systemRoot and return every detected HTTP route.
 * Each result includes file + line so every claim is traceable.
 */
export async function detectRoutes(systemAbsRoot: string): Promise<DetectedRoute[]> {
  const files = await collectSourceFiles(systemAbsRoot);
  const allRoutes: DetectedRoute[] = [];

  await Promise.all(
    files.map(async (abs) => {
      const rel = path.relative(systemAbsRoot, abs);
      const routes = await parseFileForRoutes(abs, rel);
      allRoutes.push(...routes);
    })
  );

  // De-duplicate exact (method+path+file) duplicates
  const seen = new Set<string>();
  return allRoutes.filter((r) => {
    const key = `${r.method}:${r.path}:${r.file}:${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
