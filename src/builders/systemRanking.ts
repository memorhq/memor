import type { MemorSystem, SystemTier, SystemType } from "../types";

export type RankingContext = {
  candidateName: string;
  underApps: boolean;
  underPackages: boolean;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Tooling / config packages — low developer “start here” value */
export function isLikelySupportOnlyPackageName(name: string): boolean {
  const n = name.toLowerCase();
  if (n === "tsconfig" || n.startsWith("tsconfig-") || n.endsWith("-tsconfig"))
    return true;
  if (n.includes("eslint-config") || n.startsWith("@eslint/")) return true;
  if (
    (n.includes("prettier") && n.includes("config")) ||
    n === "prettier-config"
  )
    return true;
  if (
    n.includes("tailwind") &&
    (n.includes("config") || n.endsWith("-config"))
  )
    return true;
  if (n.includes("postcss-config") || n === "postcss") return true;
  if (n.includes("babel-config") || n === "babel.config") return true;
  if (n.includes("jest-config") || n.includes("vitest-config")) return true;
  if (n.includes("rollup-config") || n.includes("webpack-config")) return true;
  if (n === "config" || n === "configs") return true;
  if (n === "types" || n.endsWith("-types")) return true;
  if (n.includes("typedoc")) return true;
  if (n.includes("commitlint") || n.includes("lint-staged")) return true;
  return false;
}

function isDomainHeavySharedPackage(
  system: MemorSystem,
  candidateName: string
): boolean {
  const n = candidateName.toLowerCase();
  if (
    /prisma|database|drizzle|orm|platform|features|components|ui|design|trpc|sdk|core-lib|shared|domain/.test(
      n
    )
  )
    return true;
  return system.blocks.some(
    (b) => b.type === "database" || b.type === "api-layer" || b.type === "features"
  );
}

/**
 * Primary = runnable / user-facing apps under apps or repo root.
 * Secondary = valuable shared code. Support = config/types/tooling packages.
 */
export function assignSystemTier(
  system: MemorSystem,
  ctx: RankingContext
): SystemTier {
  if (isLikelySupportOnlyPackageName(ctx.candidateName)) return "support";

  const t = system.type;

  if (ctx.underApps) {
    if (t === "web-app" || t === "api-service" || t === "worker") return "primary";
    if (t === "docs-site") return "primary";
    if (t === "ui-library" || t === "shared-package") return "secondary";
    if (t === "infra") return "secondary";
    return "secondary";
  }

  if (!ctx.underPackages && system.rootPath === ".") {
    if (t === "web-app" || t === "api-service" || t === "worker" || t === "docs-site")
      return "primary";
    if (t === "infra") return "secondary";
    return "secondary";
  }

  if (ctx.underPackages) {
    if (t === "ui-library") return "secondary";
    if (t === "shared-package") {
      return isDomainHeavySharedPackage(system, ctx.candidateName)
        ? "secondary"
        : "support";
    }
    if (t === "api-service" || t === "worker") return "secondary";
    if (t === "docs-site") return "secondary";
    if (t === "web-app") return "secondary";
    if (t === "infra") return "support";
    return "support";
  }

  return "secondary";
}

const BASE_BY_TYPE: Record<SystemType, number> = {
  "web-app": 0.9,
  "api-service": 0.88,
  worker: 0.8,
  "docs-site": 0.72,
  "ui-library": 0.62,
  "shared-package": 0.55,
  infra: 0.45,
  "support-system": 0.3,
  unknown: 0.35,
};

/**
 * Higher = show first in reports. Uses type, tier, layout, and a small confidence nudge.
 */
export function computeImportanceScore(
  system: MemorSystem,
  ctx: RankingContext
): number {
  let score = BASE_BY_TYPE[system.type];

  if (system.systemTier === "primary") score += 0.08;
  else if (system.systemTier === "support") score -= 0.18;

  if (ctx.underApps) score += 0.06;

  if (isLikelySupportOnlyPackageName(ctx.candidateName)) score -= 0.14;

  if (ctx.underPackages && system.systemTier === "support") score -= 0.05;

  score += (system.confidence - 0.5) * 0.08;

  return clamp01(score);
}

/** Sort by importance only (legacy helper for single-tier lists). */
export function sortSystemsByRelevance(systems: MemorSystem[]): MemorSystem[] {
  return [...systems].sort((a, b) => {
    if (b.importanceScore !== a.importanceScore)
      return b.importanceScore - a.importanceScore;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.name.localeCompare(b.name);
  });
}

const TIER_ORDER: SystemTier[] = ["primary", "secondary", "support"];

/**
 * Primary → secondary → support; within each tier by importance, confidence, name.
 */
export function sortSystemsGroupedByTier(systems: MemorSystem[]): MemorSystem[] {
  const rank = (t: SystemTier) => TIER_ORDER.indexOf(t);
  return [...systems].sort((a, b) => {
    const tr = rank(a.systemTier) - rank(b.systemTier);
    if (tr !== 0) return tr;
    if (b.importanceScore !== a.importanceScore)
      return b.importanceScore - a.importanceScore;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.name.localeCompare(b.name);
  });
}
