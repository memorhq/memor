import type { Dirent, Stats } from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import type { FlatScanEntry, ScanNode, ScanResult } from "../types";
import { getExtension } from "../utils/file";
import {
  isDeprioritizedDirectory,
  isLikelyNoiseFile,
  shouldSkipDirectory,
} from "./filterNoise";
import { relativeToRoot, toPosix } from "../utils/path";

const MAX_DEPTH = 40;
const MAX_CHILDREN_PER_DIR = 500;

async function readDirSafe(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Recursively scans a repository, skipping heavy noise dirs and recording them.
 */
export async function scanRepo(repoRoot: string): Promise<ScanResult> {
  const ignoredPaths: string[] = [];
  const deprioritizedPaths: string[] = [];
  let skippedDirs = 0;
  let hitDepthLimit = false;
  let hitChildCap = false;

  async function walk(
    fullPath: string,
    depth: number
  ): Promise<ScanNode | null> {
    if (depth > MAX_DEPTH) {
      hitDepthLimit = true;
      return null;
    }

    const name = path.basename(fullPath);
    const rel = relativeToRoot(repoRoot, fullPath);
    let stat: Stats;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      return null;
    }

    const isDirectory = stat.isDirectory();
    const extension = isDirectory ? "" : getExtension(name);

    const node: ScanNode = {
      fullPath,
      relativePath: rel,
      name,
      extension,
      isDirectory,
      children: [],
    };

    if (!isDirectory) {
      if (isLikelyNoiseFile(extension)) {
        return null;
      }
      return node;
    }

    if (depth > 0 && shouldSkipDirectory(name)) {
      ignoredPaths.push(toPosix(rel));
      skippedDirs++;
      return null;
    }

    if (depth > 0 && isDeprioritizedDirectory(name)) {
      deprioritizedPaths.push(toPosix(rel));
    }

    const entries = await readDirSafe(fullPath);
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    if (sorted.length > MAX_CHILDREN_PER_DIR) hitChildCap = true;
    const limited = sorted.slice(0, MAX_CHILDREN_PER_DIR);

    for (const ent of limited) {
      if (ent.name === "." || ent.name === "..") continue;
      const childPath = path.join(fullPath, ent.name);
      const child = await walk(childPath, depth + 1);
      if (child) node.children.push(child);
    }

    return node;
  }

  const rootStat = await fs.stat(repoRoot).catch(() => null);
  if (!rootStat || !rootStat.isDirectory()) {
    throw new Error(`Not a directory or inaccessible: ${repoRoot}`);
  }

  const root = await walk(repoRoot, 0);
  if (!root) {
    throw new Error(`Failed to scan repository root: ${repoRoot}`);
  }

  const uniqueIgnored = [...new Set(ignoredPaths)].sort();
  const uniqueDeprioritized = [...new Set(deprioritizedPaths)].sort();

  return {
    root,
    ignoredPaths: uniqueIgnored,
    deprioritizedPaths: uniqueDeprioritized,
    meta: { skippedDirs, hitDepthLimit, hitChildCap },
  };
}

/** Flatten scan tree for quick lookups */
export function flattenScanTree(root: ScanNode): FlatScanEntry[] {
  const out: FlatScanEntry[] = [];

  function visit(n: ScanNode): void {
    out.push({
      fullPath: n.fullPath,
      relativePath: n.relativePath,
      name: n.name,
      extension: n.extension,
      isDirectory: n.isDirectory,
    });
    for (const c of n.children) visit(c);
  }

  visit(root);
  return out;
}

/** Subtree rooted at relative path prefix (posix), or null */
export function findSubtreeByRelativePath(
  root: ScanNode,
  relativePrefix: string
): ScanNode | null {
  const norm = relativePrefix === "." ? "" : relativePrefix.replace(/\/$/, "");
  if (!norm) return root;

  const parts = norm.split("/").filter(Boolean);
  let cur: ScanNode = root;
  for (const part of parts) {
    const next = cur.children.find(
      (c) => c.isDirectory && c.name === part
    );
    if (!next) return null;
    cur = next;
  }
  return cur;
}
