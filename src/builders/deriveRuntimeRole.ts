import type { MemorSystem, RuntimeRole } from "../types";
import { evaluateStartPathQuality } from "./evaluateStartPathQuality";
import {
  isLikelySupportOnlyPackageName,
  type RankingContext,
} from "./systemRanking";

/**
 * Whether this system is something you typically run, import, or only configure.
 */
export function deriveRuntimeRole(
  system: MemorSystem,
  ctx: RankingContext
): RuntimeRole {
  if (isLikelySupportOnlyPackageName(ctx.candidateName)) return "support";

  if (system.type === "ui-library" || system.type === "shared-package")
    return "consumable";

  if (system.type === "unknown") {
    const q = evaluateStartPathQuality(
      system.recommendedStartPath,
      system.type
    );
    if (q === "none") return "consumable";
    if (q === "metadata-fallback") {
      if (isLikelySupportOnlyPackageName(ctx.candidateName)) return "support";
      return "consumable";
    }
    return "consumable";
  }

  if (system.type === "infra") {
    const q = evaluateStartPathQuality(
      system.recommendedStartPath,
      system.type
    );
    if (q === "strong-runtime-entry") return "runnable";
    return "support";
  }

  const q = evaluateStartPathQuality(
    system.recommendedStartPath,
    system.type
  );

  if (q === "metadata-fallback" || q === "none") return "consumable";

  if (q === "source-anchor" && ctx.underPackages) {
    /** packages/* rarely a standalone runnable server/browser app without a strong entry */
    if (system.type === "api-service" || system.type === "web-app")
      return "consumable";
  }

  return "runnable";
}
