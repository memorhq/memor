import * as path from "path";
import type { ScanNode, RepoSignals, SystemCandidate } from "../types";
import { relativeToRoot } from "../utils/path";

const TOP_LEVEL_SYSTEM_HINTS = new Set([
  "docs",
  "documentation",
  "studio",
  "supabase",
  "docker",
  "workers",
  "worker",
  "jobs",
  "cron",
  "infra",
  "infrastructure",
  "terraform",
  "k8s",
  "kubernetes",
  "helm",
  "mobile",
  "desktop",
  "cli",
  "packages",
  "apps",
  "services",
  "api",
  "web",
  "frontend",
  "backend",
  "server",
  "admin",
  "dashboard",
  "providers",
  "shared",
  "chart",
  "clients",
  "gateway",
  "registry",
]);

/** Compound names that strongly suggest a self-contained module or system */
const COMPOUND_SUFFIX_HINTS =
  /-(core|sdk|ctl|cli|server|api|ui|lib|common|shared|plugins?)$/i;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "out",
  ".cache", ".vercel", "coverage", "__pycache__", ".husky", ".github",
  ".vscode", ".idea", ".svelte-kit", ".nuxt", "__tests__", "__mocks__",
  "test", "tests", "smoke", "triage",
]);

/** Directories that are architecturally significant even without package.json */
const NON_PACKAGE_SYSTEM_DIRS: Record<string, string> = {
  compiler:      "Compiler or build-time transformation directory.",
  scripts:       "Build scripts, CI tooling, or repo infrastructure.",
  examples:      "Example projects and usage demonstrations.",
  benchmark:     "Performance benchmarking infrastructure.",
  benchmarking:  "Performance benchmarking infrastructure.",
  fixtures:      "Test fixtures and reference data.",
  playgrounds:   "Development playgrounds for manual testing.",
  playground:    "Development playground for manual testing.",
  documentation: "In-repo documentation source.",
  docs:          "In-repo documentation source.",
  e2e:           "End-to-end test infrastructure.",
};

function childDirs(node: ScanNode): ScanNode[] {
  return node.children.filter((c) => c.isDirectory);
}

function hasPackageJson(node: ScanNode): boolean {
  return node.children.some(
    (c) => !c.isDirectory && c.name === "package.json"
  );
}

/**
 * Recursively find all directories that contain a package.json,
 * stopping descent once a package.json is found (a package doesn't
 * contain sub-packages of itself in the same tree).
 */
function findPackageRoots(
  node: ScanNode,
  repoRoot: string,
  depth: number = 0
): SystemCandidate[] {
  if (depth > 4) return [];
  const results: SystemCandidate[] = [];

  for (const child of childDirs(node)) {
    if (SKIP_DIRS.has(child.name)) continue;

    if (hasPackageJson(child)) {
      results.push({
        name: child.name,
        rootPath: child.fullPath,
        relativeRoot: relativeToRoot(repoRoot, child.fullPath),
        reason: `Package with its own \`package.json\` under \`${relativeToRoot(repoRoot, node.fullPath)}/\`.`,
      });
    } else {
      results.push(...findPackageRoots(child, repoRoot, depth + 1));
    }
  }

  return results;
}

/**
 * Proposes distinct systems (apps/packages/special folders or whole repo).
 * Recursively discovers nested packages under apps/ and packages/.
 */
export function detectSystemCandidates(
  repoRoot: string,
  scanRoot: ScanNode,
  signals: RepoSignals
): SystemCandidate[] {
  const candidates: SystemCandidate[] = [];
  const rootChildren = childDirs(scanRoot);

  const apps = rootChildren.find((c) => c.name === "apps");
  const packages = rootChildren.find((c) => c.name === "packages");

  if (apps) {
    candidates.push(...findPackageRoots(apps, repoRoot));
  }

  if (packages) {
    candidates.push(...findPackageRoots(packages, repoRoot));
  }

  // Detect architecturally significant non-package directories at repo root
  for (const dir of rootChildren) {
    if (dir.name === "apps" || dir.name === "packages") continue;
    const lower = dir.name.toLowerCase();
    const desc = NON_PACKAGE_SYSTEM_DIRS[lower];
    if (desc && dir.children.length >= 2) {
      candidates.push({
        name: dir.name,
        rootPath: dir.fullPath,
        relativeRoot: relativeToRoot(repoRoot, dir.fullPath),
        reason: desc,
        isNonPackage: true,
      });
    }
  }

  // If the repo root has its own package.json AND a src/ directory,
  // include it as a primary system even when packages/ or scripts/ exist.
  // Without this, projects whose main code lives at the root alongside
  // auxiliary dirs (scripts/, packages/) would have their core invisible.
  const rootHasPackageJson = hasPackageJson(scanRoot);
  const rootHasSrc = rootChildren.some((c) => c.name === "src");
  const rootAlreadyCovered = candidates.some((c) => c.relativeRoot === ".");

  if (rootHasPackageJson && rootHasSrc && !rootAlreadyCovered) {
    candidates.push({
      name: path.basename(repoRoot) || "repository",
      rootPath: repoRoot,
      relativeRoot: ".",
      reason:
        "Repository root contains its own package.json and src/ directory, indicating a primary system alongside auxiliary packages.",
    });
  }

  if (candidates.length > 0) {
    return dedupeCandidates(candidates);
  }

  const hinted: SystemCandidate[] = [];
  for (const dir of rootChildren) {
    if (dir.name === "apps" || dir.name === "packages") continue;
    const lower = dir.name.toLowerCase();
    if (
      TOP_LEVEL_SYSTEM_HINTS.has(lower) ||
      COMPOUND_SUFFIX_HINTS.test(lower)
    ) {
      hinted.push({
        name: dir.name,
        rootPath: dir.fullPath,
        relativeRoot: relativeToRoot(repoRoot, dir.fullPath),
        reason: `Top-level folder name \`${dir.name}/\` strongly suggests a separate concern.`,
      });
    }
  }

  if (hinted.length >= 2) {
    return dedupeCandidates(hinted);
  }

  if (signals.isMonorepoLayout && hinted.length === 1) {
    return dedupeCandidates(hinted);
  }

  return [
    {
      name: path.basename(repoRoot) || "repository",
      rootPath: repoRoot,
      relativeRoot: ".",
      reason:
        signals.isMonorepoLayout && !apps && !packages
          ? `Workspace-style repo without \`apps/\` or \`packages/\` split; treating the repository root as one primary system to analyze.`
          : `Single-project layout: analyzing the repository root as one cohesive system.`,
    },
  ];
}

function dedupeCandidates(list: SystemCandidate[]): SystemCandidate[] {
  const seen = new Set<string>();
  const out: SystemCandidate[] = [];
  for (const c of list) {
    const key = c.rootPath;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
