import * as path from "path";
import type { EntryPoint, FlatScanEntry, SystemType } from "../types";
import { pathExists, readTextSafe } from "../utils/file";
import { relativeFromDir, toPosix } from "../utils/path";
import { parseJsonLoose } from "../utils/text";

type Candidate = {
  rel: string;
  kind: EntryPoint["kind"];
  reason: string;
  confidence: number;
};

const WEB_PATTERNS: { pattern: RegExp; reason: string; confidence: number }[] =
  [
    {
      pattern: /^app\/(layout|page)\.(tsx|jsx|js|ts)$/,
      reason: "Next.js App Router root layout or page.",
      confidence: 0.9,
    },
    {
      pattern: /^src\/app\/(layout|page)\.(tsx|jsx|js|ts)$/,
      reason: "Next.js App Router under `src/app/`.",
      confidence: 0.9,
    },
    {
      pattern: /^pages\/(_app|index)\.(tsx|jsx|js|ts)$/,
      reason: "Next.js Pages Router `_app` or index page.",
      confidence: 0.85,
    },
    {
      pattern: /^src\/pages\/(_app|index)\.(tsx|jsx|js|ts)$/,
      reason: "Next.js Pages Router under `src/pages/`.",
      confidence: 0.85,
    },
    {
      pattern: /^src\/main\.(tsx|jsx|ts|js)$/,
      reason: "Common SPA entry (`src/main`).",
      confidence: 0.82,
    },
    {
      pattern: /^src\/index\.(tsx|jsx|ts|js)$/,
      reason: "Common SPA/library entry (`src/index`).",
      confidence: 0.78,
    },
    {
      pattern: /^index\.html$/,
      reason: "Static HTML entry (often Vite/webpack).",
      confidence: 0.7,
    },
  ];

const API_PATTERNS: { pattern: RegExp; reason: string; confidence: number }[] =
  [
    {
      pattern: /^src\/main\.(ts|js|mts|cts)$/,
      reason: "Nest/Node convention: `src/main`.",
      confidence: 0.88,
    },
    {
      pattern: /^src\/cli\.(ts|js|mts|cts)$/,
      reason: "CLI entry `src/cli`.",
      confidence: 0.86,
    },
    {
      pattern: /^src\/index\.(ts|js|mts|cts)$/,
      reason: "Node service entry `src/index`.",
      confidence: 0.8,
    },
    {
      pattern: /^src\/server\.(ts|js)$/,
      reason: "Explicit `src/server` entry.",
      confidence: 0.82,
    },
    {
      pattern: /^main\.(ts|js|mts|cts)$/,
      reason: "Top-level `main` entry.",
      confidence: 0.75,
    },
    {
      pattern: /^cli\.(ts|js|mts|cts)$/,
      reason: "Top-level CLI entry.",
      confidence: 0.82,
    },
    {
      pattern: /^index\.(ts|js|mts|cts)$/,
      reason: "Top-level `index` entry.",
      confidence: 0.68,
    },
    {
      pattern: /^server\.(ts|js)$/,
      reason: "Top-level `server` entry.",
      confidence: 0.78,
    },
    {
      // Fullstack apps: server entry inside a named service directory (server/, app/, api/)
      pattern: /^(server|app|api)\/(index|main|server)\.(ts|js|mts|cts)$/,
      reason: "Service entry inside server/app/api subdirectory.",
      confidence: 0.72,
    },
  ];

const LIB_PATTERNS: { pattern: RegExp; reason: string; confidence: number }[] =
  [
    {
      pattern: /^src\/index\.(ts|tsx|js|jsx)$/,
      reason: "Library barrel `src/index`.",
      confidence: 0.85,
    },
    {
      pattern: /^index\.(ts|tsx|js|jsx)$/,
      reason: "Package root `index` export.",
      confidence: 0.72,
    },
  ];

function collectMatchingFiles(
  systemRoot: string,
  under: FlatScanEntry[],
  patterns: { pattern: RegExp; reason: string; confidence: number }[],
  kind: EntryPoint["kind"]
): Candidate[] {
  const found: Candidate[] = [];
  for (const e of under) {
    if (e.isDirectory) continue;
    const posix = relativeFromDir(systemRoot, e.fullPath) || e.name;
    for (const { pattern, reason, confidence } of patterns) {
      if (pattern.test(posix)) {
        found.push({ rel: posix, kind, reason, confidence });
        break;
      }
    }
  }
  return found;
}

function uniqBest(cands: Candidate[]): Candidate[] {
  const byPath = new Map<string, Candidate>();
  for (const c of cands) {
    const prev = byPath.get(c.rel);
    if (!prev || c.confidence > prev.confidence) byPath.set(c.rel, c);
  }
  return [...byPath.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * Finds likely entry files for a system; verifies paths exist on disk.
 */
export async function detectEntryPoints(
  systemRoot: string,
  systemRootRelative: string,
  flatIndex: FlatScanEntry[],
  systemType: SystemType
): Promise<EntryPoint[]> {
  const norm = path.normalize(systemRoot);
  const under = flatIndex.filter((e) => {
    const fp = path.normalize(e.fullPath);
    return fp === norm || fp.startsWith(norm + path.sep);
  });

  let pool: Candidate[] = [];

  // Check package.json "bin" field — strongest signal for CLI entry points.
  // Maps dist paths back to src (e.g. "dist/cli.js" → "src/cli.ts").
  const pkgJsonEntry = under.find(
    (e) => !e.isDirectory && e.name === "package.json" &&
      path.dirname(path.normalize(e.fullPath)) === norm
  );
  if (pkgJsonEntry) {
    const raw = await readTextSafe(pkgJsonEntry.fullPath);
    if (raw) {
      const pkg = parseJsonLoose(raw);
      if (pkg && typeof pkg.bin === "object" && pkg.bin !== null) {
        for (const distFile of Object.values(pkg.bin as Record<string, string>)) {
          const srcFile = distFile
            .replace(/^\.\//, "")
            .replace(/^dist\//, "src/")
            .replace(/\.js$/, ".ts");
          const exists = await pathExists(path.join(systemRoot, srcFile));
          if (exists) {
            pool.push({
              rel: srcFile,
              kind: "api",
              reason: `CLI binary entry from package.json \`bin\` field.`,
              confidence: 0.92,
            });
          }
        }
      } else if (pkg && typeof pkg.bin === "string") {
        const srcFile = pkg.bin
          .replace(/^\.\//, "")
          .replace(/^dist\//, "src/")
          .replace(/\.js$/, ".ts");
        const exists = await pathExists(path.join(systemRoot, srcFile));
        if (exists) {
          pool.push({
            rel: srcFile,
            kind: "api",
            reason: `CLI binary entry from package.json \`bin\` field.`,
            confidence: 0.92,
          });
        }
      }
    }
  }

  if (systemType === "web-app" || systemType === "unknown") {
    pool.push(...collectMatchingFiles(systemRoot, under, WEB_PATTERNS, "web"));
  }
  if (systemType === "api-service" || systemType === "worker" || systemType === "unknown") {
    pool.push(...collectMatchingFiles(systemRoot, under, API_PATTERNS, "api"));
  }
  if (
    systemType === "shared-package" ||
    systemType === "ui-library" ||
    systemType === "unknown"
  ) {
    pool.push(...collectMatchingFiles(systemRoot, under, LIB_PATTERNS, "library"));
  }

  if (systemType === "docs-site") {
    const docRoots = under.filter(
      (e) =>
        e.isDirectory &&
        (e.name === "docs" || e.name === "pages" || e.name === "src")
    );
    for (const d of docRoots.slice(0, 3)) {
      pool.push({
        rel: toPosix(d.relativePath) + "/",
        kind: "docs",
        reason: `Documentation or site root folder \`${d.name}/\` for content and routing.`,
        confidence: 0.65,
      });
    }
    pool.push(
      ...collectMatchingFiles(systemRoot, under, WEB_PATTERNS, "docs").map((c) => ({
        ...c,
        kind: "docs" as const,
        reason: c.reason + " (treated as docs-site entry surface).",
      }))
    );
  }

  if (systemType === "infra") {
    const infraFiles = [
      "docker-compose.yml",
      "docker-compose.yaml",
      "Dockerfile",
    ];
    for (const f of infraFiles) {
      const hit = under.find((e) => !e.isDirectory && e.name === f);
      if (hit) {
        pool.push({
          rel: toPosix(hit.relativePath),
          kind: "infra",
          reason: `${f} is a common orchestration or image entry for this system.`,
          confidence: 0.85,
        });
      }
    }
  }

  pool = uniqBest(pool);

  const maxPoints = systemType === "unknown" ? 8 : 6;
  const out: EntryPoint[] = [];

  for (const c of pool.slice(0, maxPoints)) {
    const full =
      c.rel.endsWith("/") && c.rel !== "."
        ? path.join(systemRoot, c.rel.slice(0, -1))
        : path.join(systemRoot, ...c.rel.split("/").filter(Boolean));
    if (!(await pathExists(full))) continue;

    const displayRel =
      systemRootRelative === "."
        ? c.rel
        : toPosix(path.join(systemRootRelative, c.rel));

    out.push({
      path: displayRel,
      kind: c.kind,
      reason: c.reason,
      confidence: c.confidence,
    });
  }

  // Before package.json fallback, try non-JS source anchors (Python, Go, mixed)
  if (out.length === 0) {
    const anchors = detectSourceAnchors(norm, under, systemRootRelative);
    out.push(...anchors);
  }

  if (out.length === 0) {
    const pkg = under.find((e) => !e.isDirectory && e.name === "package.json");
    if (pkg) {
      out.push({
        path:
          systemRootRelative === "."
            ? "package.json"
            : toPosix(path.join(systemRootRelative, "package.json")),
        kind: "unknown",
        reason:
          "Fallback: `package.json` defines scripts and metadata when no clearer entry file matched.",
        confidence: 0.45,
      });
    }
  }

  return out;
}

/**
 * Structural source anchors for non-JS/TS repos: meaningful domain folders,
 * Python package roots, orchestration directories, etc.
 */
const SOURCE_ANCHOR_DIRS: Record<string, { reason: string; confidence: number }> = {
  src:        { reason: "Primary source tree for this system.", confidence: 0.6 },
  lib:        { reason: "Library source root.", confidence: 0.55 },
  core:       { reason: "Core implementation root.", confidence: 0.58 },
  scheduler:  { reason: "Scheduler implementation root.", confidence: 0.56 },
  executor:   { reason: "Executor or task-runner root.", confidence: 0.56 },
  workflows:  { reason: "Workflow definitions root.", confidence: 0.55 },
  dags:       { reason: "DAG definitions root (orchestration).", confidence: 0.55 },
  providers:  { reason: "Provider/connector ecosystem root.", confidence: 0.52 },
  operators:  { reason: "Operator definitions root.", confidence: 0.52 },
  hooks:      { reason: "Hooks or composable logic root.", confidence: 0.5 },
  clients:    { reason: "Client library root.", confidence: 0.5 },
  sdk:        { reason: "SDK implementation root.", confidence: 0.54 },
  api:        { reason: "API surface root.", confidence: 0.55 },
  models:     { reason: "Model or domain definitions root.", confidence: 0.5 },
  plugins:    { reason: "Plugin ecosystem root.", confidence: 0.5 },
};

const NON_JS_ENTRY_FILES: { pattern: RegExp; reason: string; confidence: number }[] = [
  { pattern: /^(src\/)?__init__\.py$/, reason: "Python package root.", confidence: 0.58 },
  { pattern: /^(src\/)?main\.py$/, reason: "Python main entry.", confidence: 0.62 },
  { pattern: /^(src\/)?app\.py$/, reason: "Python app entry.", confidence: 0.6 },
  { pattern: /^setup\.py$/, reason: "Python setup script.", confidence: 0.48 },
  { pattern: /^pyproject\.toml$/, reason: "Python project manifest.", confidence: 0.48 },
  { pattern: /^main\.go$/, reason: "Go main entry.", confidence: 0.62 },
  { pattern: /^cmd\//, reason: "Go cmd entry directory.", confidence: 0.58 },
  { pattern: /^Cargo\.toml$/, reason: "Rust crate manifest.", confidence: 0.55 },
  { pattern: /^(src\/)?main\.rs$/, reason: "Rust main entry.", confidence: 0.62 },
  { pattern: /^(src\/)?lib\.rs$/, reason: "Rust library entry.", confidence: 0.6 },
];

function detectSourceAnchors(
  systemRootNorm: string,
  under: FlatScanEntry[],
  systemRootRelative: string
): EntryPoint[] {
  const out: EntryPoint[] = [];

  // Check for non-JS entry files first
  for (const e of under) {
    if (e.isDirectory) continue;
    const posix = relativeFromDir(systemRootNorm, e.fullPath) || e.name;
    for (const { pattern, reason, confidence } of NON_JS_ENTRY_FILES) {
      if (pattern.test(posix)) {
        const displayRel =
          systemRootRelative === "."
            ? posix
            : toPosix(path.join(systemRootRelative, posix));
        out.push({ path: displayRel, kind: "library", reason, confidence });
        break;
      }
    }
    if (out.length >= 3) break;
  }

  // Check for meaningful domain directories as anchors
  const directChildren = under.filter((e) => {
    if (!e.isDirectory) return false;
    const parent = path.dirname(path.normalize(e.fullPath));
    return parent === systemRootNorm;
  });

  for (const dir of directChildren) {
    const anchor = SOURCE_ANCHOR_DIRS[dir.name.toLowerCase()];
    if (!anchor) continue;
    const displayRel =
      systemRootRelative === "."
        ? dir.name + "/"
        : toPosix(path.join(systemRootRelative, dir.name)) + "/";
    out.push({
      path: displayRel,
      kind: "library",
      reason: anchor.reason,
      confidence: anchor.confidence,
    });
    if (out.length >= 4) break;
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}
