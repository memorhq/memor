/**
 * detectDBOps — scan source files and extract real database operations.
 *
 * Supports:
 *   - Prisma:    prisma.user.findMany(), prisma.post.create(), etc.
 *   - Drizzle:   db.select().from(users), db.insert(schema.users).values(...)
 *   - Mongoose:  User.find(), User.create(), User.findById(), etc.
 *   - Knex:      knex('users').select(), knex.from('table')
 *   - Raw SQL:   Literal SQL strings / template literals: SELECT, INSERT, UPDATE, DELETE
 *
 * Every result is file + line grounded. No narration.
 */
import fsPromises from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import { parse } from "@babel/parser";

export type DBClient =
  | "prisma"
  | "drizzle"
  | "mongoose"
  | "knex"
  | "sequelize"
  | "typeorm"
  | "raw-sql"
  | "unknown";

export type DBOperation = {
  /** 'find', 'create', 'update', 'delete', 'select', 'insert', 'raw', etc. */
  operation: string;
  /** Table / collection / model name if detectable */
  model?: string;
  /** Which ORM/client detected this */
  client: DBClient;
  /** Relative file path from system root */
  file: string;
  /** 1-based line number */
  line: number;
  /** 0–1 */
  confidence: number;
};

// ── Constants ─────────────────────────────────────────────────────────

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

// Prisma CRUD methods
const PRISMA_METHODS = new Set([
  "findUnique","findFirst","findMany","create","createMany",
  "update","updateMany","upsert","delete","deleteMany",
  "count","aggregate","groupBy","findUniqueOrThrow","findFirstOrThrow",
]);

// Mongoose methods
const MONGOOSE_METHODS = new Set([
  "find","findOne","findById","findByIdAndUpdate","findByIdAndDelete",
  "findOneAndUpdate","findOneAndDelete","create","insertMany",
  "updateOne","updateMany","deleteOne","deleteMany","countDocuments",
  "aggregate","save",
]);

// Raw SQL keyword detection
const RAW_SQL_RE = /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

// ── AST types ─────────────────────────────────────────────────────────

type ASTNode = Record<string, unknown>;

function lineOf(n: ASTNode): number {
  const loc = n["loc"] as ASTNode | undefined;
  const start = loc?.["start"] as ASTNode | undefined;
  return (start?.["line"] as number) ?? 0;
}

function memberChain(node: ASTNode): string[] {
  // Unwrap chained member expressions: a.b.c → ['a','b','c']
  if (node["type"] !== "MemberExpression") return [];
  const obj = node["object"] as ASTNode;
  const prop = node["property"] as ASTNode;
  const propName = (prop["name"] as string) ?? (prop["value"] as string);
  if (!propName) return [];
  return [...memberChain(obj), propName];
}

function calleeName(node: ASTNode): string[] {
  const callee = node["callee"] as ASTNode | undefined;
  if (!callee) return [];
  if (callee["type"] === "Identifier") return [callee["name"] as string];
  if (callee["type"] === "MemberExpression") return memberChain(callee);
  return [];
}

function firstStrArg(args: ASTNode[]): string | undefined {
  const a = args?.[0];
  if (!a) return undefined;
  if (a["type"] === "StringLiteral") return a["value"] as string;
  return undefined;
}

// ── Collectors ────────────────────────────────────────────────────────

function collectDBOps(
  node: unknown,
  file: string,
  ops: DBOperation[]
): void {
  if (!node || typeof node !== "object") return;
  const n = node as ASTNode;

  if (n["type"] === "CallExpression") {
    const chain = calleeName(n);
    const args  = (n["arguments"] as ASTNode[]) ?? [];

    // ── Prisma: prisma.user.findMany() ────────────────────────────────
    // chain = ['prisma','user','findMany'] or ['this','prisma','user','findMany']
    if (chain.length >= 3) {
      const prismaIdx = chain.indexOf("prisma");
      if (prismaIdx >= 0 && chain.length >= prismaIdx + 3) {
        const model = chain[prismaIdx + 1];
        const method = chain[prismaIdx + 2];
        if (model && method && PRISMA_METHODS.has(method) && !/^[A-Z]/.test(model)) {
          // model should be lowercase (prisma uses camelCase model names)
          ops.push({
            operation: method,
            model,
            client: "prisma",
            file,
            line: lineOf(n),
            confidence: 0.95,
          });
        }
      }
    }

    // ── Drizzle: db.select().from(users), db.insert(table).values(...) ─
    if (chain.length >= 2) {
      const dbIdx = chain.findIndex((c) => /^db$/i.test(c));
      if (dbIdx >= 0) {
        const op = chain[dbIdx + 1];
        if (op === "select" || op === "insert" || op === "update" || op === "delete") {
          // Try to get table from .from(tableName) or .into(tableName)
          let model: string | undefined;
          // table is often the argument to .from() in the next chained call
          // We emit without model here — the chain will be walked when we recurse
          ops.push({
            operation: op,
            client: "drizzle",
            file,
            line: lineOf(n),
            confidence: 0.85,
          });
        }
      }
    }

    // ── Mongoose: User.find(), User.create() ───────────────────────────
    if (chain.length === 2) {
      const [modelName, method] = chain;
      if (
        modelName &&
        method &&
        /^[A-Z]/.test(modelName) &&   // PascalCase = Mongoose model
        MONGOOSE_METHODS.has(method)
      ) {
        ops.push({
          operation: method,
          model: modelName,
          client: "mongoose",
          file,
          line: lineOf(n),
          confidence: 0.85,
        });
      }
    }

    // ── Knex: knex('table').select() ──────────────────────────────────
    if (chain.length >= 1 && /^knex$/i.test(chain[0])) {
      const table = firstStrArg(args);
      if (table) {
        ops.push({
          operation: chain[1] ?? "query",
          model: table,
          client: "knex",
          file,
          line: lineOf(n),
          confidence: 0.85,
        });
      }
    }

    // ── Sequelize: ModelName.findAll(), ModelName.create() ────────────
    if (chain.length === 2) {
      const [modelName, method] = chain;
      const SEQUELIZE_METHODS = new Set([
        "findAll","findOne","findByPk","create","bulkCreate",
        "update","destroy","count","findAndCountAll","upsert",
      ]);
      if (modelName && method && /^[A-Z]/.test(modelName) && SEQUELIZE_METHODS.has(method)) {
        ops.push({
          operation: method,
          model: modelName,
          client: "sequelize",
          file,
          line: lineOf(n),
          confidence: 0.8,
        });
      }
    }
  }

  // ── Raw SQL string literals ────────────────────────────────────────
  if (n["type"] === "StringLiteral" || n["type"] === "TemplateLiteral") {
    let raw: string | undefined;
    if (n["type"] === "StringLiteral") raw = n["value"] as string;
    if (n["type"] === "TemplateLiteral") {
      const quasis = (n["quasis"] as ASTNode[]) ?? [];
      raw = quasis.map((q) => (q["value"] as ASTNode)?.["cooked"] ?? "").join("?");
    }
    if (raw && raw.length > 10 && RAW_SQL_RE.test(raw)) {
      // Extract table from simple patterns
      const tableMatch = raw.match(/\bFROM\s+["'`]?(\w+)["'`]?/i) ??
                         raw.match(/\bINTO\s+["'`]?(\w+)["'`]?/i) ??
                         raw.match(/\bUPDATE\s+["'`]?(\w+)["'`]?/i);
      const op = (raw.match(/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i)?.[1] ?? "raw").toLowerCase();
      ops.push({
        operation: op,
        model: tableMatch?.[1],
        client: "raw-sql",
        file,
        line: lineOf(n),
        confidence: 0.8,
      });
    }
  }

  // Recurse
  for (const key of Object.keys(n)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    const child = n[key];
    if (Array.isArray(child)) {
      for (const item of child) collectDBOps(item, file, ops);
    } else if (child && typeof child === "object" && "type" in (child as object)) {
      collectDBOps(child, file, ops);
    }
  }
}

// ── Per-file parser ───────────────────────────────────────────────────

// Quick pre-filter: only parse files that look like they contain DB calls
const DB_PREFILTER_RE = /\b(?:prisma|mongoose|knex|sequelize|typeorm|findMany|findOne|findAll|\.from\(|\.select\(|\.insert\(|\.update\(|\.delete\(|SELECT\s+|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/;

async function parseFileForDBOps(
  absPath: string,
  relPath: string
): Promise<DBOperation[]> {
  let source: string;
  try {
    const stat = await fsPromises.stat(absPath);
    if (stat.size > MAX_FILE_SIZE) return [];
    source = await fsPromises.readFile(absPath, "utf8");
  } catch {
    return [];
  }

  if (!DB_PREFILTER_RE.test(source)) return [];

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

  const ops: DBOperation[] = [];
  collectDBOps(ast.program, relPath, ops);
  return ops;
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
 * Scan all source files in systemRoot and return detected database operations.
 * Results are deduplicated by (client, model, operation, file, line).
 */
export async function detectDBOperations(systemAbsRoot: string): Promise<DBOperation[]> {
  const files = await collectSourceFiles(systemAbsRoot);
  const allOps: DBOperation[] = [];

  await Promise.all(
    files.map(async (abs) => {
      const rel = path.relative(systemAbsRoot, abs);
      const ops = await parseFileForDBOps(abs, rel);
      allOps.push(...ops);
    })
  );

  // De-duplicate exact same ops (same client+model+op+file+line)
  const seen = new Set<string>();
  return allOps.filter((op) => {
    const key = `${op.client}:${op.model}:${op.operation}:${op.file}:${op.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
