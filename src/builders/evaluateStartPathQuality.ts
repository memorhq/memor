import type { SystemType } from "../types";

export type StartPathQuality =
  | "strong-runtime-entry"
  | "source-anchor"
  | "metadata-fallback"
  | "none";

const STRONG_WEB = [
  /(^|\/)app\/(layout|page)\.(tsx|jsx|ts|js)$/,
  /(^|\/)src\/app\/(layout|page)\.(tsx|jsx|ts|js)$/,
  /(^|\/)pages\/(_app|index)\.(tsx|jsx|ts|js)$/,
  /(^|\/)src\/pages\/(_app|index)\.(tsx|jsx|ts|js)$/,
  /(^|\/)src\/main\.(tsx|jsx)$/,
  /(^|\/)index\.html$/,
];

const STRONG_API = [
  /(^|\/)src\/main\.(ts|js|mts|cts)$/,
  /(^|\/)src\/server\.(ts|js)$/,
  /(^|\/)server\.(ts|js)$/,
  /(^|\/)main\.(ts|js|mts|cts)$/,
];

const SOURCE_ANCHOR = [
  /(^|\/)src\/index\.(ts|tsx|js|jsx)$/,
  /(^|\/)index\.(ts|tsx|js|jsx)$/,
  /(^|\/)docs\/?$/,
  /(^|\/)src\/?$/,
];

function matchesAny(p: string, patterns: RegExp[]): boolean {
  const x = p.replace(/\/+$/, "");
  return patterns.some((re) => re.test(x));
}

/**
 * How much “real runtime” a recommended path implies — drives flows, runtimeRole, and gates.
 */
export function evaluateStartPathQuality(
  recommendedPath: string | undefined,
  systemType: SystemType
): StartPathQuality {
  if (!recommendedPath || !recommendedPath.trim()) return "none";

  const p = recommendedPath.trim();
  if (p.endsWith("package.json") || p.endsWith("/package.json"))
    return "metadata-fallback";

  if (p.endsWith("/") && (p.includes("docs") || p.endsWith("src/")))
    return "source-anchor";

  if (systemType === "web-app" || systemType === "docs-site") {
    if (matchesAny(p, STRONG_WEB)) return "strong-runtime-entry";
    if (matchesAny(p, SOURCE_ANCHOR)) return "source-anchor";
    return "source-anchor";
  }

  if (systemType === "api-service" || systemType === "worker") {
    if (matchesAny(p, STRONG_API)) return "strong-runtime-entry";
    if (matchesAny(p, SOURCE_ANCHOR)) return "source-anchor";
    return "source-anchor";
  }

  if (systemType === "infra") {
    if (/docker-compose\.ya?ml$/i.test(p) || /Dockerfile$/i.test(p))
      return "strong-runtime-entry";
    return "source-anchor";
  }

  if (systemType === "ui-library" || systemType === "shared-package") {
    if (matchesAny(p, STRONG_WEB)) return "strong-runtime-entry";
    if (matchesAny(p, SOURCE_ANCHOR)) return "source-anchor";
    return "source-anchor";
  }

  if (matchesAny(p, STRONG_WEB) || matchesAny(p, STRONG_API))
    return "strong-runtime-entry";
  if (matchesAny(p, SOURCE_ANCHOR)) return "source-anchor";
  return "source-anchor";
}
