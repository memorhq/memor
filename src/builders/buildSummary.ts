import type { MemorSystem, RepoSignals, RepoSummary } from "../types";

function repoStyleLabel(
  systems: MemorSystem[],
  signals: RepoSignals
): RepoSummary["detectedRepoStyle"] {
  const multi =
    systems.length > 1 ||
    (signals.hasAppsDir && signals.hasPackagesDir) ||
    (signals.hasAppsDir && systems.length > 0);

  if (signals.isMonorepoLayout && multi) return "monorepo";
  if (systems.length > 1) return "multi-system";
  if (systems.length === 1 && !signals.isMonorepoLayout) return "single-app";
  if (signals.isMonorepoLayout) return "monorepo";
  return "unknown";
}

function typeLabel(t: MemorSystem["type"]): string {
  const map: Record<MemorSystem["type"], string> = {
    "web-app": "web app",
    "api-service": "API service",
    "ui-library": "UI library",
    "docs-site": "documentation site",
    "shared-package": "shared package",
    infra: "infrastructure",
    worker: "worker",
    "support-system": "support system",
    unknown: "unclassified system",
  };
  return map[t];
}

/**
 * One short overview paragraph for HTML/Markdown (not part of RepoSummary JSON shape).
 */
export function formatSummaryNarrative(
  summary: RepoSummary,
  systems: MemorSystem[]
): string {
  const uniqueBits = [...new Set(systems.map((s) => typeLabel(s.type)))];

  if (systems.length === 0) {
    return "Memor did not detect separate systems in this path; the repository may be empty or inaccessible.";
  }
  if (summary.detectedRepoStyle === "monorepo") {
    return `This repository appears to be a monorepo with ${systems.length} detected system(s): ${uniqueBits.join(", ")}. Memor identified likely entry points and architectural blocks for each system to reduce initial exploration overhead.`;
  }
  if (systems.length > 1) {
    return `Multiple distinct systems (${systems.length}) were inferred from layout and naming. Each section below summarizes entry points, core blocks, and a rough flow skeleton.`;
  }
  return `This repository is analyzed as a single primary system (${typeLabel(systems[0].type)}). Entry points and folder-level blocks are listed to shortcut folder-by-folder browsing.`;
}

/**
 * Repo-level counts for `RepoAnalysis.summary`.
 */
export function buildSummary(
  totalFiles: number,
  totalDirectories: number,
  systems: MemorSystem[],
  signals: RepoSignals
): RepoSummary {
  const detectedRepoStyle = repoStyleLabel(systems, signals);

  return {
    totalFiles,
    totalDirectories,
    detectedFrameworks: signals.frameworks,
    detectedRepoStyle,
    totalSystems: systems.length,
  };
}
