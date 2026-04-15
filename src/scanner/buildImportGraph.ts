/**
 * buildImportGraph — walk all source files in a system directory,
 * extract imports, and compute a file-level reverse dependency map.
 *
 * This enables blast radius computation for single-package repos that have
 * no cross-system connections — answering "which files does everyone depend on?"
 */
import fs from "fs";
import fsPromises from "fs/promises";
import type { Dirent } from "fs";
import * as path from "path";
import { walkImports } from "./walkImports";

export type HotFile = {
  /** Path relative to the system root */
  path: string;
  /** Number of files that directly import this file */
  directImporterCount: number;
};

export type ImportGraphStats = {
  /** Total source files analyzed */
  totalFiles: number;
  /** Files ordered by direct importer count (descending) */
  hotFiles: HotFile[];
  /**
   * 0–100: how interconnected the codebase is internally.
   * Higher = more files depend on fewer shared modules = larger blast radius for core files.
   */
  interconnectednessScore: number;
};

// Dirs to skip when walking source files (keep analysis focused on production code)
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "coverage", "__pycache__", ".cache",
  // Non-production code
  "test", "tests", "__tests__", "e2e", "spec", "__mocks__", "fixtures", "__fixtures__",
  "examples", "example", "demo", "demos", "sample", "samples",
  "benchmarks", "benchmark", "bench", "perf",
  "__snapshots__", "__stories__", "storybook-static",
]);

const SOURCE_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

/**
 * Collect all source files within a directory, skipping noise dirs.
 * Returns absolute paths.
 */
async function collectSourceFiles(
  dir: string,
  maxFiles = 600
): Promise<string[]> {
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    if (result.length >= maxFiles) return;
    let entries: Dirent[];
    try {
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (result.length >= maxFiles) break;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(path.join(current, entry.name));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTS.has(ext)) {
          result.push(path.join(current, entry.name));
        }
      }
    }
  }

  await walk(dir);
  return result;
}

/**
 * Resolve an import path (relative, as written) from a source file's directory
 * into a canonical path relative to the system root. Returns null if unresolvable.
 *
 * Does NOT do filesystem lookups — approximates by stripping extensions and
 * normalizing. Good enough for fanin counting.
 */
function resolveImport(
  importedPath: string,
  fromFileDir: string,
  systemRoot: string
): string | null {
  if (!importedPath.startsWith(".")) return null; // external — skip

  const resolved = path.resolve(fromFileDir, importedPath);

  // Strip common extensions for canonical comparison
  const canonical = resolved.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, "");

  // Must be within the system root
  const rel = path.relative(systemRoot, canonical);
  if (rel.startsWith("..")) return null;

  return rel; // e.g. "src/core/router"
}

/**
 * Build an import graph for a system and return hot-file stats.
 * Only analyzes JS/TS source files; skips test files and large files.
 */
export async function buildImportGraphStats(
  systemAbsRoot: string
): Promise<ImportGraphStats> {
  const sourceFiles = await collectSourceFiles(systemAbsRoot);
  if (sourceFiles.length === 0) {
    return { totalFiles: 0, hotFiles: [], interconnectednessScore: 0 };
  }

  // Reverse dependency map: canonical path → set of canonical paths that import it
  const importers = new Map<string, Set<string>>();

  // Ensure all source files appear in the map (even with 0 importers)
  for (const abs of sourceFiles) {
    const rel = path.relative(systemAbsRoot, abs);
    const canonical = rel.replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, "");
    if (!importers.has(canonical)) importers.set(canonical, new Set());
  }

  // Walk imports for each file
  await Promise.all(
    sourceFiles.map(async (abs) => {
      const fromDir = path.dirname(abs);
      const imports = await walkImports(abs);

      const fromCanonical = path
        .relative(systemAbsRoot, abs)
        .replace(/\.(js|jsx|ts|tsx|mjs|cjs)$/, "");

      for (const imp of imports) {
        const resolved = resolveImport(imp, fromDir, systemAbsRoot);
        if (!resolved) continue;
        if (!importers.has(resolved)) importers.set(resolved, new Set());
        importers.get(resolved)!.add(fromCanonical);
      }
    })
  );

  // Build hot files list
  const hotFiles: HotFile[] = [];
  for (const [canonical, importerSet] of importers) {
    if (importerSet.size === 0) continue;
    // Convert canonical back to a readable path
    hotFiles.push({
      path: canonical,
      directImporterCount: importerSet.size,
    });
  }
  hotFiles.sort((a, b) => b.directImporterCount - a.directImporterCount);

  // Interconnectedness score:
  // What fraction of files have at least 1 importer? Weighted by how many.
  const totalFiles = sourceFiles.length;
  const filesWithImporters = hotFiles.length;
  const avgImporterCount =
    hotFiles.reduce((s, f) => s + f.directImporterCount, 0) /
    Math.max(hotFiles.length, 1);

  // Score: fraction with importers (0-60) + avg importer count contribution (0-40)
  const fractionScore = (filesWithImporters / totalFiles) * 60;
  const avgScore = Math.min((avgImporterCount / 5) * 40, 40);
  const interconnectednessScore = Math.round(fractionScore + avgScore);

  return {
    totalFiles,
    hotFiles: hotFiles.slice(0, 20), // keep top 20
    interconnectednessScore,
  };
}
