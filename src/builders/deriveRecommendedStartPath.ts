import type { EntryPoint, MemorSystem, SystemType } from "../types";

export type StartPathResult = {
  path?: string;
  reason?: string;
  confidence?: "high" | "medium" | "fallback";
};

function pathRankForType(pathNorm: string, systemType: SystemType): number {
  const p = pathNorm.replace(/\/+$/, "");

  const webFirst = [
    /(^|\/)app\/layout\.(tsx|jsx|ts|js)$/,
    /(^|\/)app\/page\.(tsx|jsx|ts|js)$/,
    /(^|\/)src\/app\/layout\.(tsx|jsx|ts|js)$/,
    /(^|\/)src\/app\/page\.(tsx|jsx|ts|js)$/,
    /(^|\/)pages\/_app\.(tsx|jsx|ts|js)$/,
    /(^|\/)pages\/index\.(tsx|jsx|ts|js)$/,
    /(^|\/)src\/pages\/_app\.(tsx|jsx|ts|js)$/,
    /(^|\/)src\/pages\/index\.(tsx|jsx|ts|js)$/,
    /(^|\/)src\/main\.(tsx|jsx)$/,
    /(^|\/)src\/index\.(tsx|jsx)$/,
    /(^|\/)index\.html$/,
  ];

  const apiFirst = [
    /(^|\/)src\/cli\.(ts|js|mts|cts)$/,
    /(^|\/)src\/main\.(ts|js|mts|cts)$/,
    /(^|\/)src\/server\.(ts|js)$/,
    /(^|\/)src\/index\.(ts|js|mts|cts)$/,
    /(^|\/)cli\.(ts|js|mts|cts)$/,
    /(^|\/)server\.(ts|js)$/,
    /(^|\/)main\.(ts|js|mts|cts)$/,
    /(^|\/)index\.(ts|js|mts|cts)$/,
  ];

  const libFirst = [
    /(^|\/)src\/index\.(ts|tsx|js|jsx)$/,
    /(^|\/)index\.(ts|tsx|js|jsx)$/,
  ];

  const infraFirst = [/docker-compose\.ya?ml$/, /(^|\/)Dockerfile$/];

  const pick = (patterns: RegExp[], base: number) => {
    for (let i = 0; i < patterns.length; i++) {
      if (patterns[i].test(p)) return base - i;
    }
    return 0;
  };

  if (systemType === "web-app" || systemType === "docs-site") {
    const w = pick(webFirst, 100);
    if (w) return w;
  }

  if (systemType === "api-service" || systemType === "worker") {
    const a = pick(apiFirst, 95);
    if (a) return a;
  }

  if (systemType === "ui-library" || systemType === "shared-package") {
    const l = pick(libFirst, 88);
    if (l) return l;
  }

  if (systemType === "infra") {
    const i = pick(infraFirst, 92);
    if (i) return i;
  }

  if (systemType === "unknown") {
    return Math.max(
      pick(webFirst, 85),
      pick(apiFirst, 85),
      pick(libFirst, 80)
    );
  }

  return 0;
}

function entryScore(ep: EntryPoint, systemType: SystemType): number {
  const base = pathRankForType(ep.path, systemType);
  if (ep.path.endsWith("package.json") || /(^|\/)package\.json$/.test(ep.path))
    return 12 + ep.confidence * 8;

  if (ep.kind === "docs" && ep.path.endsWith("/")) return 70 + ep.confidence * 10;

  // Source anchor directories (non-JS roots) should rank above package.json
  if (base === 0 && ep.confidence > 0 && ep.kind === "library") {
    return 30 + ep.confidence * 20;
  }

  return base + ep.confidence * 15;
}

function isPkgJson(p: string): boolean {
  return p.endsWith("package.json") || p.endsWith("/package.json");
}

function confidenceLabel(ep: EntryPoint, score: number): "high" | "medium" | "fallback" {
  if (isPkgJson(ep.path)) return "fallback";
  if (score >= 70 || ep.confidence >= 0.7) return "high";
  if (score >= 30 || ep.confidence >= 0.45) return "medium";
  return "fallback";
}

function reasonLabel(ep: EntryPoint): string {
  if (isPkgJson(ep.path)) {
    return "No stronger runtime or source anchor was found, so manifest fallback was used.";
  }
  return ep.reason;
}

/**
 * Single "open this first" path with explanation.
 */
export function deriveRecommendedStartPath(system: MemorSystem): StartPathResult {
  if (system.entryPoints.length === 0) return {};

  if (system.systemTier === "support") {
    const nonPkg = system.entryPoints.filter((e) => !isPkgJson(e.path));
    if (nonPkg.length === 0) return {};
  }

  const sorted = [...system.entryPoints].sort((a, b) => {
    const sb = entryScore(b, system.type);
    const sa = entryScore(a, system.type);
    if (sb !== sa) return sb - sa;
    return b.confidence - a.confidence;
  });

  const best = sorted[0];
  const bestScore = entryScore(best, system.type);

  if (isPkgJson(best.path)) {
    const alt = sorted.find(
      (e) => !isPkgJson(e.path) && entryScore(e, system.type) > 28
    );
    if (alt) {
      const altScore = entryScore(alt, system.type);
      return {
        path: alt.path,
        reason: reasonLabel(alt),
        confidence: confidenceLabel(alt, altScore),
      };
    }
    if (system.systemTier === "support") return {};
    return {
      path: best.path,
      reason: reasonLabel(best),
      confidence: "fallback",
    };
  }

  return {
    path: best.path,
    reason: reasonLabel(best),
    confidence: confidenceLabel(best, bestScore),
  };
}
