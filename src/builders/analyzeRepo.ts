import * as path from "path";
import type { MemorSystem, RepoAnalysis, RepoMode, SystemCandidate } from "../types";
import { flattenScanTree, scanRepo } from "../scanner/scanRepo";
import { detectRepoSignals } from "../detectors/detectRepoSignals";
import { detectSystemCandidates } from "../detectors/detectSystemCandidates";
import { classifySystemType } from "../detectors/classifySystemType";
import { applyRunnableConfidenceGate } from "../detectors/applyRunnableConfidenceGate";
import { detectEntryPoints } from "../detectors/detectEntryPoints";
import { detectBlocks } from "../detectors/detectBlocks";
import { detectAppArchetype } from "../detectors/detectAppArchetype";
import { detectPackageArchetype } from "../detectors/detectPackageArchetype";
import {
  detectRepoMode,
  deriveRepoCenter,
  buildRepoNarrative,
} from "../detectors/detectRepoMode";
import { applyRepoModeConsistency } from "../detectors/applyRepoModeConsistency";
import { detectRepoCenterSystems } from "../detectors/detectRepoCenterSystems";
import { inferSupportRole } from "../detectors/inferSupportRole";
import { detectSubsystems } from "../detectors/detectSubsystems";
import { enrichSystemDescription } from "./enrichSystemNarrative";
import { buildFlowSkeletons } from "./buildFlowSkeletons";
import { buildSummary } from "./buildSummary";
import { deriveRecommendedStartPath } from "./deriveRecommendedStartPath";
import { evaluateStartPathQuality } from "./evaluateStartPathQuality";
import { deriveRuntimeRole } from "./deriveRuntimeRole";
import {
  assignSystemTier,
  computeImportanceScore,
  sortSystemsGroupedByTier,
  type RankingContext,
} from "./systemRanking";
import { buildSystemConnections } from "./buildSystemConnections";
import { buildInternalArchitecture } from "./buildInternalArchitecture";
import { slugify, parseJsonLoose } from "../utils/text";
import { normalizeRepoRoot } from "../utils/path";
import { readTextSafe } from "../utils/file";
import { detectAppInternalUnits } from "../detectors/detectAppInternalUnits";

// ── Per-system tech detection ─────────────────────────────────────────

type TechSignal = { dep: string; label: string };

const TECH_SIGNALS: TechSignal[] = [
  // Frameworks
  { dep: "next",         label: "Next.js" },
  { dep: "nuxt",         label: "Nuxt" },
  { dep: "astro",        label: "Astro" },
  { dep: "@angular/core",label: "Angular" },
  { dep: "svelte",       label: "Svelte" },
  { dep: "vue",          label: "Vue" },
  { dep: "react",        label: "React" },
  { dep: "preact",       label: "Preact" },
  { dep: "solid-js",     label: "Solid" },
  { dep: "express",      label: "Express" },
  { dep: "fastify",      label: "Fastify" },
  { dep: "@nestjs/core", label: "NestJS" },
  { dep: "hono",         label: "Hono" },
  { dep: "remix",        label: "Remix" },
  { dep: "@remix-run/node", label: "Remix" },
  // Build tools
  { dep: "vite",         label: "Vite" },
  { dep: "esbuild",      label: "esbuild" },
  { dep: "webpack",      label: "Webpack" },
  { dep: "rollup",       label: "Rollup" },
  // Databases / ORMs
  { dep: "prisma",       label: "Prisma" },
  { dep: "@prisma/client", label: "Prisma" },
  { dep: "drizzle-orm",  label: "Drizzle" },
  { dep: "mongoose",     label: "MongoDB" },
  { dep: "pg",           label: "PostgreSQL" },
  { dep: "redis",        label: "Redis" },
  // Testing
  { dep: "vitest",       label: "Vitest" },
  { dep: "jest",         label: "Jest" },
  // State
  { dep: "zustand",      label: "Zustand" },
  { dep: "redux",        label: "Redux" },
  { dep: "@reduxjs/toolkit", label: "Redux Toolkit" },
  // Styling
  { dep: "tailwindcss",  label: "Tailwind" },
  // GraphQL
  { dep: "graphql",      label: "GraphQL" },
  { dep: "@apollo/client", label: "Apollo" },
];

function detectTechFromPkg(
  pkg: Record<string, any> | null,
  rootPath: string,
  flat: { fullPath: string; extension: string; isDirectory: boolean }[]
): string[] {
  const tech: string[] = [];
  const seen = new Set<string>();

  // Language detection from file extensions within this system
  const norm = path.normalize(rootPath);
  const sysFiles = flat.filter(
    (e) => !e.isDirectory && path.normalize(e.fullPath).startsWith(norm + path.sep)
  );
  let tsCount = 0, jsCount = 0, pyCount = 0, goCount = 0, rsCount = 0;
  for (const f of sysFiles.slice(0, 200)) {
    const ext = f.extension;
    if (ext === "ts" || ext === "tsx") tsCount++;
    else if (ext === "js" || ext === "jsx") jsCount++;
    else if (ext === "py") pyCount++;
    else if (ext === "go") goCount++;
    else if (ext === "rs") rsCount++;
  }
  if (tsCount > jsCount && tsCount > 0) { tech.push("TypeScript"); seen.add("TypeScript"); }
  else if (jsCount > 0) { tech.push("JavaScript"); seen.add("JavaScript"); }
  if (pyCount > 3) { tech.push("Python"); seen.add("Python"); }
  if (goCount > 3) { tech.push("Go"); seen.add("Go"); }
  if (rsCount > 3) { tech.push("Rust"); seen.add("Rust"); }

  if (!pkg) return tech;

  const allDeps: Record<string, string> = {
    ...((pkg.dependencies as Record<string, string>) || {}),
    ...((pkg.devDependencies as Record<string, string>) || {}),
    ...((pkg.peerDependencies as Record<string, string>) || {}),
  };

  for (const sig of TECH_SIGNALS) {
    if (sig.dep in allDeps && !seen.has(sig.label)) {
      tech.push(sig.label);
      seen.add(sig.label);
    }
  }

  return tech.slice(0, 6);
}

export type AnalyzeResult = {
  analysis: RepoAnalysis;
  /** Scanned but tagged low-priority (tests, CI, etc.) — still in the tree */
  deprioritizedPaths: string[];
  /** Scan-level metadata for quality assessment */
  scanMeta: { skippedDirs: number; hitDepthLimit: boolean; hitChildCap: boolean };
};

function countFilesAndDirs(flat: { isDirectory: boolean }[]): {
  files: number;
  dirs: number;
} {
  let files = 0;
  let dirs = 0;
  for (const e of flat) {
    if (e.isDirectory) dirs += 1;
    else files += 1;
  }
  return { files, dirs };
}

function rankingContext(c: SystemCandidate): RankingContext {
  const rr = c.relativeRoot === "." ? "" : c.relativeRoot;
  const parts = rr.split("/").filter(Boolean);
  return {
    candidateName: c.name,
    underApps: parts[0] === "apps",
    underPackages: parts[0] === "packages",
  };
}

/**
 * Full pipeline: scan → classify → entry points → runnable gate → blocks → tier/score/start → runtime role → flows → tier-group sort → summary.
 */
export async function analyzeRepo(repoPath: string): Promise<AnalyzeResult> {
  const rootPath = normalizeRepoRoot(repoPath);
  const repoName = path.basename(rootPath);

  const scan = await scanRepo(rootPath);
  const flat = flattenScanTree(scan.root);
  const { files: totalFiles, dirs: totalDirectories } =
    countFilesAndDirs(flat);

  const signals = await detectRepoSignals(rootPath);
  const candidates = detectSystemCandidates(rootPath, scan.root, signals);

  const systems: MemorSystem[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const sysId = `sys-${slugify(c.name)}-${i}`;
    const rctx = rankingContext(c);

    // Non-package systems (compiler/, scripts/, examples/, etc.)
    if (c.isNonPackage) {
      const npFiles = flat.filter(
        (e) => !e.isDirectory && path.normalize(e.fullPath).startsWith(path.normalize(c.rootPath) + path.sep)
      );
      systems.push({
        id: sysId,
        name: c.name,
        type: "support-system",
        systemTier: "support",
        runtimeRole: "consumable",
        importanceScore: 0.3,
        rootPath: c.relativeRoot,
        confidence: 0.7,
        description: c.reason,
        entryPoints: [],
        blocks: [],
        flows: [],
        tags: [],
      });
      continue;
    }

    const classifyCtx = {
      candidateFolderName: c.name,
      relativeRoot: c.relativeRoot,
    };

    let classification = await classifySystemType(
      c.rootPath,
      rootPath,
      flat,
      classifyCtx
    );

    const relRoot = c.relativeRoot;
    const rootPathOut = relRoot === "." ? "." : relRoot;

    let entryPoints = await detectEntryPoints(
      c.rootPath,
      relRoot,
      flat,
      classification.type
    );

    const gated = applyRunnableConfidenceGate(
      classification,
      c.rootPath,
      flat,
      classifyCtx,
      entryPoints
    );

    if (gated.type !== classification.type) {
      entryPoints = await detectEntryPoints(
        c.rootPath,
        relRoot,
        flat,
        gated.type
      );
    }
    classification = gated;

    const blocks = detectBlocks(
      c.rootPath,
      relRoot,
      flat,
      sysId
    );

    const baseDescription = `${classification.description} Candidate: ${c.reason}`;

    // Read package.json description + deps for enrichment
    const pkgJsonRaw = await readTextSafe(path.join(c.rootPath, "package.json"));
    const pkgJson = pkgJsonRaw ? parseJsonLoose(pkgJsonRaw) : null;
    const pkgDesc = pkgJson && typeof pkgJson.description === "string" && pkgJson.description.length > 5
      ? pkgJson.description
      : undefined;
    const detectedTech = detectTechFromPkg(pkgJson, c.rootPath, flat);

    const tags: string[] = [];
    if (signals.frameworks.length)
      tags.push(...signals.frameworks.slice(0, 6));

    const tagsOut = [...new Set(tags)].slice(0, 8);

    const draft: MemorSystem = {
      id: sysId,
      name: c.name,
      type: classification.type,
      systemTier: "secondary",
      runtimeRole: "consumable",
      importanceScore: 0,
      packageDescription: pkgDesc,
      detectedTech: detectedTech.length > 0 ? detectedTech : undefined,
      rootPath: rootPathOut,
      confidence: classification.confidence,
      description: baseDescription,
      entryPoints,
      blocks,
      flows: [],
      tags: tagsOut,
    };

    draft.systemTier = assignSystemTier(draft, rctx);
    draft.importanceScore = computeImportanceScore(draft, rctx);
    const startResult = deriveRecommendedStartPath(draft);
    draft.recommendedStartPath = startResult.path;
    draft.startPathReason = startResult.reason;
    draft.startPathConfidence = startResult.confidence;
    draft.startPathQuality = evaluateStartPathQuality(draft.recommendedStartPath, draft.type);
    draft.runtimeRole = deriveRuntimeRole(draft, rctx);
    draft.appArchetype = detectAppArchetype(
      draft,
      { candidateName: c.name, relativeRoot: relRoot },
      flat,
      c.rootPath
    );
    draft.subsystems = detectSubsystems(draft, c.rootPath, relRoot, flat);
    draft.packageArchetype = detectPackageArchetype(draft, rctx);
    draft.description = enrichSystemDescription(baseDescription, draft, repoName);
    draft.flows = buildFlowSkeletons(draft);

    systems.push(draft);
  }

  // Read README excerpt for each system (used to enrich descriptions)
  for (const s of systems) {
    if (s.type === "support-system") continue;
    const sysAbs = s.rootPath === "." ? rootPath : path.resolve(rootPath, s.rootPath);
    const readmeNames = ["README.md", "readme.md", "Readme.md", "README.MD"];
    for (const name of readmeNames) {
      const raw = await readTextSafe(path.join(sysAbs, name), 4000);
      if (!raw) continue;
      const excerpt = extractReadmeExcerpt(raw);
      if (excerpt) {
        s.readmeExcerpt = excerpt;
      }
      break;
    }
  }

  // Deduplicate: if two systems share the same name, keep the one with higher confidence
  // (this can happen when a package appears in multiple locations, e.g. nested examples/)
  const seenNames = new Map<string, MemorSystem>();
  for (const s of systems) {
    const key = s.name.toLowerCase();
    const prev = seenNames.get(key);
    if (!prev) {
      seenNames.set(key, s);
    } else {
      // Keep the one with higher confidence, or more blocks, or shorter rootPath (closer to root)
      const prevDepth = prev.rootPath.split("/").length;
      const curDepth = s.rootPath.split("/").length;
      const betterConfidence = s.confidence > prev.confidence;
      const moreBlocks = s.blocks.length > prev.blocks.length && s.confidence >= prev.confidence - 0.1;
      const shallower = curDepth < prevDepth;
      if (betterConfidence || moreBlocks || shallower) {
        seenNames.set(key, s);
      }
    }
  }
  const dedupedSystems = [...seenNames.values()];

  const sortedSystems = sortSystemsGroupedByTier(dedupedSystems);

  const summary = buildSummary(
    totalFiles,
    totalDirectories,
    sortedSystems,
    signals
  );

  const partialAnalysis = {
    repoName,
    systems: sortedSystems,
    summary,
  };
  const { mode: repoMode } = detectRepoMode(partialAnalysis);

  // Phase 1: normalise types that contradict repo mode
  applyRepoModeConsistency(sortedSystems, repoMode);

  // Phase 2: promote core systems and assign role hints
  promoteForRepoMode(sortedSystems, repoMode, repoName);
  detectRepoCenterSystems(sortedSystems, repoMode, repoName);

  // Phase 3: infer support roles for non-center systems
  for (const s of sortedSystems) {
    s.inferredSupportRole = inferSupportRole(s, repoMode);
  }

  // Phase 4: re-enrich descriptions, archetypes, and flows for affected systems
  for (const s of sortedSystems) {
    if (s.systemRoleHint || s.isRepoCenter || s.inferredSupportRole) {
      s.packageArchetype = detectPackageArchetype(s, { candidateName: s.name });
      s.description = enrichSystemDescription(s.description, s, repoName);
    }
    if (s.systemTier === "primary") {
      s.flows = buildFlowSkeletons(s, repoMode);
    }
  }

  // Phase 5: build system-level connections
  await buildSystemConnections(sortedSystems, rootPath, flat, repoMode);

  // Phase 5b: connection-aware hub promotion
  promoteConnectionHub(sortedSystems, repoName);

  // Phase 6: build internal architecture for each system
  for (const s of sortedSystems) {
    s.internalStructure =
      (await buildInternalArchitecture(s, rootPath)) ?? undefined;
  }

  // Phase 7: for product-web-app repos, decompose internal architecture
  if (repoMode === "product-web-app" && sortedSystems.length <= 3) {
    const mainSystem = sortedSystems.find((s) => s.type !== "support-system") ?? sortedSystems[0];
    if (mainSystem) {
      const appUnits = detectAppInternalUnits(mainSystem, rootPath, flat);
      if (appUnits.length >= 2) {
        sortedSystems.push(...appUnits);
      }
    }
  }

  const finalSystems = sortSystemsGroupedByTier(sortedSystems);
  const repoCenter = deriveRepoCenter(repoMode);
  const repoNarrative = buildRepoNarrative(
    { repoName, systems: finalSystems, summary },
    repoMode
  );

  const analysis: RepoAnalysis = {
    repoName,
    rootPath,
    repoMode,
    repoCenter,
    repoNarrative,
    systems: finalSystems,
    ignoredPaths: scan.ignoredPaths,
    summary,
  };

  return {
    analysis,
    deprioritizedPaths: scan.deprioritizedPaths,
    scanMeta: scan.meta,
  };
}

/**
 * Extract a 1–2 sentence description from a README file.
 * Skips headings, badges, install instructions, and code blocks.
 */
function extractReadmeExcerpt(raw: string): string | null {
  const lines = raw.split("\n");
  let inCodeBlock = false;
  const candidates: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip headings, badges, empty lines, HTML tags, install/usage sections
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("![") || trimmed.startsWith("[![")) continue;
    if (trimmed.startsWith("<")) continue;
    if (trimmed.startsWith("|")) continue;  // tables
    if (/^(npm install|yarn add|pnpm add|npx |bun add)/i.test(trimmed)) continue;
    if (/^(install|usage|getting started|quick start|table of contents|license)/i.test(trimmed)) continue;

    // Require at least 30 chars and a letter, skip lines that look like code
    if (trimmed.length < 30) continue;
    if (/^[`$>]/.test(trimmed)) continue;
    if (/^\s*(import|require|const |let |var |export )/i.test(trimmed)) continue;

    candidates.push(trimmed);
    if (candidates.length >= 3) break;
  }

  if (candidates.length === 0) return null;

  // Take first 1-2 candidates, join, and truncate to 200 chars
  let result = candidates.slice(0, 2).join(" ").trim();
  // Clean up markdown links [text](url) → text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Clean up bold/italic
  result = result.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  // Truncate
  if (result.length > 220) {
    result = result.slice(0, 217) + "...";
  }

  return result.length >= 30 ? result : null;
}

/**
 * After connections are built, promote the system with the most incoming
 * connections to primary/center if it clearly dominates the graph.
 * Uses a composite score: incoming weight + outgoing weight + extends-target bonus.
 */
function promoteConnectionHub(
  systems: MemorSystem[],
  repoName: string
): void {
  if (systems.length < 3) return;
  const hasCenter = systems.some((s) => s.isRepoCenter);
  if (hasCenter) return;

  function hubScore(s: MemorSystem): number {
    const inc = s.connections?.incoming ?? [];
    const out = s.connections?.outgoing ?? [];
    let score = inc.length * 2 + out.length;
    // Systems that others extend are more architecturally central
    const extendsCount = inc.filter(
      (c) => c.relation === "used-by" &&
        systems.find((x) => x.id === c.targetSystemId)?.connections?.outgoing
          ?.some((o) => o.targetSystemId === s.id && o.relation === "extends")
    ).length;
    score += extendsCount * 3;
    return score;
  }

  const scored = systems.map((s) => ({ sys: s, score: hubScore(s) }));
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (best.score >= 8 && best.score > second.score * 1.3) {
    best.sys.isRepoCenter = true;
    best.sys.systemTier = "primary";
    best.sys.importanceScore = Math.max(best.sys.importanceScore, 0.9);
    if (!best.sys.systemRoleHint || best.sys.systemRoleHint === "unknown") {
      const rnFlat = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const nFlat = best.sys.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (nFlat === rnFlat || nFlat.includes(rnFlat) || rnFlat.includes(nFlat)) {
        best.sys.systemRoleHint = "framework-core-package";
      }
    }
  }
}

/**
 * After repo-level mode detection, selectively promote the most important
 * packages to primary tier for framework-core and library-tooling repos.
 * Also enriches descriptions for promoted packages. Mutates in place.
 */
function promoteForRepoMode(
  systems: MemorSystem[],
  repoMode: RepoMode,
  repoName: string
): void {
  const rnLower = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const FRAMEWORK_CORE_NAMES =
    /^(core|common|runtime|scheduler|compiler|reconciler|server|dom)$/i;

  if (repoMode === "framework-core") {
    let promoted = false;
    for (const s of systems) {
      if (s.type === "support-system") continue;
      const n = s.name.toLowerCase();
      const nFlat = n.replace(/[^a-z0-9]/g, "");
      if (
        FRAMEWORK_CORE_NAMES.test(n) ||
        nFlat === rnLower ||
        nFlat === `${rnLower}dom` ||
        nFlat === `${rnLower}server` ||
        nFlat === `${rnLower}reconciler`
      ) {
        s.systemTier = "primary";
        s.importanceScore = Math.max(s.importanceScore, 0.86);
        promoted = true;
      }
    }
    // Single-package framework: promote the one real package
    if (!promoted) {
      const realPkgs = systems.filter((s) => s.type !== "support-system");
      if (realPkgs.length === 1) {
        realPkgs[0].systemTier = "primary";
        realPkgs[0].importanceScore = Math.max(realPkgs[0].importanceScore, 0.9);
        realPkgs[0].isRepoCenter = true;
      }
    }
  }

  if (repoMode === "library-tooling") {
    let best: MemorSystem | null = null;
    for (const s of systems) {
      const nFlat = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (nFlat === rnLower || nFlat.includes(rnLower) || rnLower.includes(nFlat)) {
        if (!best || s.blocks.length > best.blocks.length) best = s;
      }
    }
    if (!best && systems.length) {
      best = systems.reduce((a, b) =>
        b.blocks.length > a.blocks.length ? b : a
      );
    }
    if (best) {
      best.systemTier = "primary";
      best.importanceScore = Math.max(best.importanceScore, 0.9);
      best.description = `This is the primary library package in this repository. It is consumed by applications and other packages rather than run directly.`;
    }
  }

  if (repoMode === "product-web-app") {
    // For single-app web repos, promote the main app as the center
    const mainApp = systems.find((s) => s.type === "web-app");
    if (mainApp) {
      mainApp.systemTier = "primary";
      mainApp.importanceScore = Math.max(mainApp.importanceScore, 0.9);
      mainApp.isRepoCenter = true;
    }
  }

  if (repoMode === "product-domain-machine") {
    // Systems under packages/ can't get primary tier from assignSystemTier, but in a
    // product-domain-machine monorepo they absolutely should be primary if they're runnable apps.
    const primaries = systems.filter((s) => s.systemTier === "primary");
    if (primaries.length === 0) {
      const RUNNABLE_TYPES = new Set(["web-app", "api-service", "worker", "docs-site"]);
      let promoted = false;
      for (const s of systems) {
        if (s.type === "support-system") continue;
        if (RUNNABLE_TYPES.has(s.type)) {
          s.systemTier = "primary";
          s.importanceScore = Math.max(s.importanceScore, 0.88);
          promoted = true;
        }
      }
      // If nothing runnable found, promote highest-importance systems
      if (!promoted) {
        const top = [...systems]
          .filter((s) => s.type !== "support-system")
          .sort((a, b) => b.importanceScore - a.importanceScore)
          .slice(0, 2);
        for (const s of top) {
          s.systemTier = "primary";
          s.importanceScore = Math.max(s.importanceScore, 0.85);
        }
      }
    }
  }

  if (repoMode === "workflow-platform") {
    for (const s of systems) {
      const n = s.name.toLowerCase();
      if (
        /-(core|server|scheduler|executor)$/.test(n) ||
        n === "core" ||
        n === rnLower
      ) {
        s.systemTier = "primary";
        s.importanceScore = Math.max(s.importanceScore, 0.88);
        s.description = `Core platform module \`${s.name}\` — a foundational component of this workflow or orchestration system.`;
      }
    }
  }
}
