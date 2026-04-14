import type { RepoAnalysis, MemorSystem } from "../types";
import type { RepoStory } from "./generateRepoStory";

// ── Public types ─────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "moderate" | "low";

export type QualityConcern = {
  signal: string;
  detail: string;
};

export type AnalysisQuality = {
  confidence: ConfidenceLevel;
  concerns: QualityConcern[];
  suggestion: string;
  metrics: QualityMetrics;
};

export type QualityMetrics = {
  totalFiles: number;
  totalSystems: number;
  connectedSystems: number;
  connectionRatio: number;
  unknownTypeCount: number;
  unknownTypeRatio: number;
  avgSystemConfidence: number;
  repoModeResolved: boolean;
  zoneCount: number;
  partialScan: boolean;
  partialScanReason?: string;
};

// ── Thresholds ────────────────────────────────────────────────────────

const MAX_HEALTHY_SYSTEMS = 40;
const MIN_CONNECTION_RATIO = 0.3;
const MAX_UNKNOWN_TYPE_RATIO = 0.5;
const MIN_AVG_CONFIDENCE = 0.5;
const MIN_ZONE_RATIO = 0.07;

// ── Main assessor ─────────────────────────────────────────────────────

export function assessAnalysisQuality(
  analysis: RepoAnalysis,
  story: RepoStory,
  scanMeta?: { skippedDirs: number; hitDepthLimit: boolean; hitChildCap: boolean }
): AnalysisQuality {
  const { systems, summary } = analysis;
  const concerns: QualityConcern[] = [];

  // ── Compute metrics ─────────────────────────────────────────────────

  const connectedSystems = countConnectedSystems(systems);
  const connectionRatio = systems.length > 0 ? connectedSystems / systems.length : 0;

  const unknownTypeCount = systems.filter((s) => s.type === "unknown").length;
  const unknownTypeRatio = systems.length > 0 ? unknownTypeCount / systems.length : 0;

  const avgSystemConfidence =
    systems.length > 0
      ? systems.reduce((sum, s) => sum + s.confidence, 0) / systems.length
      : 0;

  const repoModeResolved = analysis.repoMode !== "unknown";
  const zoneCount = story.zones.length;

  // Partial scan detection
  let partialScan = false;
  let partialScanReason: string | undefined;
  if (scanMeta?.hitDepthLimit) {
    partialScan = true;
    partialScanReason = "Directory depth limit reached — some nested directories were not scanned.";
  } else if (scanMeta?.hitChildCap) {
    partialScan = true;
    partialScanReason = "Some directories exceeded the child file limit — contents were truncated.";
  } else if (scanMeta && scanMeta.skippedDirs > 50) {
    partialScan = true;
    partialScanReason = `${scanMeta.skippedDirs} directories were skipped during scanning. Some systems may be missing.`;
  }

  const metrics: QualityMetrics = {
    totalFiles: summary.totalFiles,
    totalSystems: systems.length,
    connectedSystems,
    connectionRatio: Math.round(connectionRatio * 100) / 100,
    unknownTypeCount,
    unknownTypeRatio: Math.round(unknownTypeRatio * 100) / 100,
    avgSystemConfidence: Math.round(avgSystemConfidence * 100) / 100,
    repoModeResolved,
    zoneCount,
    partialScan,
    partialScanReason,
  };

  // ── Check each signal ───────────────────────────────────────────────

  if (partialScan) {
    concerns.push({
      signal: "partial-scan",
      detail: partialScanReason!,
    });
  }

  if (systems.length > MAX_HEALTHY_SYSTEMS) {
    concerns.push({
      signal: "too-many-systems",
      detail: `${systems.length} systems detected — this is unusually high and may indicate over-splitting of the codebase.`,
    });
  }

  if (systems.length > 5 && connectionRatio < MIN_CONNECTION_RATIO) {
    concerns.push({
      signal: "weak-connections",
      detail: `Only ${connectedSystems} of ${systems.length} systems have connections (${Math.round(connectionRatio * 100)}%). Most systems appear isolated.`,
    });
  }

  if (systems.length > 3 && unknownTypeRatio > MAX_UNKNOWN_TYPE_RATIO) {
    concerns.push({
      signal: "many-unknown-types",
      detail: `${unknownTypeCount} of ${systems.length} systems could not be classified (${Math.round(unknownTypeRatio * 100)}% unknown).`,
    });
  }

  if (!repoModeResolved) {
    concerns.push({
      signal: "unclear-repo-mode",
      detail: "Memor could not determine the overall architecture pattern (monorepo, framework, library, etc.).",
    });
  }

  if (avgSystemConfidence < MIN_AVG_CONFIDENCE) {
    concerns.push({
      signal: "low-detection-confidence",
      detail: `Average system detection confidence is ${Math.round(avgSystemConfidence * 100)}% — many systems were classified with uncertainty.`,
    });
  }

  if (systems.length > 15 && zoneCount <= 1) {
    concerns.push({
      signal: "weak-zone-grouping",
      detail: `${systems.length} systems but only ${zoneCount} architectural zone${zoneCount === 1 ? "" : "s"} formed — grouping may not reflect actual structure.`,
    });
  } else if (systems.length > 8 && zoneCount > 0 && zoneCount / systems.length < MIN_ZONE_RATIO) {
    concerns.push({
      signal: "weak-zone-grouping",
      detail: `${systems.length} systems across only ${zoneCount} zone${zoneCount === 1 ? "" : "s"} — architectural grouping is sparse.`,
    });
  }

  // ── Determine confidence level ──────────────────────────────────────
  // Separates "big repo" (partial scan but good analysis) from "bad analysis"
  // (weak connections, many unknowns).

  let confidence: ConfidenceLevel = "high";

  const analysisFailure = concerns.some((c) =>
    c.signal === "many-unknown-types" ||
    c.signal === "weak-connections"
  );
  const structuralUncertainty = concerns.some((c) =>
    c.signal === "unclear-repo-mode" ||
    c.signal === "weak-zone-grouping" ||
    c.signal === "low-detection-confidence"
  );
  const partialOnly = concerns.every((c) =>
    c.signal === "partial-scan" || c.signal === "too-many-systems"
  );

  if (analysisFailure && (structuralUncertainty || concerns.length >= 3)) {
    confidence = "low";
  } else if (analysisFailure || (structuralUncertainty && concerns.length >= 2)) {
    confidence = "moderate";
  } else if (partialOnly && connectionRatio >= 0.6) {
    // Big repo with good connectivity — partial scan is noted but not a real problem
    confidence = "high";
  } else if (concerns.length > 0) {
    confidence = "moderate";
  }

  // ── Build suggestion ────────────────────────────────────────────────

  const suggestion = buildSuggestion(confidence, concerns, metrics, analysis.repoName);

  return { confidence, concerns, suggestion, metrics };
}

// ── Helpers ───────────────────────────────────────────────────────────

function countConnectedSystems(systems: MemorSystem[]): number {
  let count = 0;
  for (const s of systems) {
    const hasOutgoing = (s.connections?.outgoing?.length ?? 0) > 0;
    const hasIncoming = (s.connections?.incoming?.length ?? 0) > 0;
    if (hasOutgoing || hasIncoming) count++;
  }
  return count;
}

function buildSuggestion(
  confidence: ConfidenceLevel,
  concerns: QualityConcern[],
  metrics: QualityMetrics,
  repoName: string
): string {
  if (confidence === "high") {
    return `Analysis looks solid — ${metrics.totalSystems} system${metrics.totalSystems !== 1 ? "s" : ""} with ${Math.round(metrics.connectionRatio * 100)}% connected.`;
  }

  const parts: string[] = [];
  parts.push(
    `Memor analyzed ${metrics.totalFiles.toLocaleString()} files across ${metrics.totalSystems} system${metrics.totalSystems !== 1 ? "s" : ""}.`
  );

  if (confidence === "low") {
    parts.push("Confidence is low");
  } else {
    parts.push("Confidence is moderate");
  }

  const reasons: string[] = [];
  for (const c of concerns) {
    if (c.signal === "partial-scan") reasons.push("scan was partial");
    else if (c.signal === "too-many-systems") reasons.push(`${metrics.totalSystems} systems is unusually high`);
    else if (c.signal === "weak-connections") reasons.push(`${metrics.connectedSystems} of ${metrics.totalSystems} systems are weakly connected`);
    else if (c.signal === "many-unknown-types") reasons.push(`${metrics.unknownTypeCount} systems couldn't be classified`);
    else if (c.signal === "unclear-repo-mode") reasons.push("repo structure is unclear");
    else if (c.signal === "low-detection-confidence") reasons.push("detection confidence is below average");
    else if (c.signal === "weak-zone-grouping") reasons.push("zone grouping is sparse");
  }

  if (reasons.length > 0) {
    parts.push(`because ${reasons.join(" and ")}.`);
  }

  // Context-aware hints — no hardcoded paths that might not exist
  const hasModeSignal = concerns.some((c) => c.signal === "unclear-repo-mode");
  const hasPartialScan = concerns.some((c) => c.signal === "partial-scan");
  const hasWeakConns = concerns.some((c) => c.signal === "weak-connections");

  if (hasPartialScan) {
    parts.push("For better results, try scoping to a specific package subdirectory.");
  } else if (hasModeSignal && metrics.totalSystems <= 2) {
    parts.push("This looks like a single-package or specialized repo — Memor shows richer results on multi-package projects.");
  } else if (hasModeSignal || hasWeakConns) {
    parts.push("Try running Memor on a specific sub-package if this is a monorepo without standard apps/ or packages/ directories.");
  }

  return parts.join(" ");
}
