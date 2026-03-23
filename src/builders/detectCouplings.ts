import type { MemorSystem, RepoAnalysis } from "../types";
import type { RepoStory } from "./generateRepoStory";

export type CouplingType = "runtime" | "build" | "api" | "integration";
export type CouplingStrength = "high" | "medium" | "low";

export type Coupling = {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  type: CouplingType;
  strength: CouplingStrength;
  reason: string;
};

export function detectCouplings(
  analysis: RepoAnalysis,
  story: RepoStory
): Coupling[] {
  const { systems } = analysis;
  const sysMap = new Map(systems.map((s) => [s.id, s]));
  const couplings: Coupling[] = [];
  const seen = new Set<string>();

  // Identify THE actual primary center (name matches repo name)
  const rn = analysis.repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const primaryCenterId = systems.find(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === rn
  )?.id;

  for (const sys of systems) {
    if (!sys.connections?.outgoing) continue;

    for (const conn of sys.connections.outgoing) {
      const target = sysMap.get(conn.targetSystemId);
      if (!target) continue;

      const pairKey = [sys.id, target.id].sort().join("::");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const type = inferCouplingType(sys, target, conn.relation, primaryCenterId);
      const strength = inferCouplingStrength(sys, target, conn, primaryCenterId);
      const reason = generateCouplingReason(sys, target, type, strength, conn.relation, primaryCenterId);

      couplings.push({
        sourceId: sys.id,
        sourceName: sys.name,
        targetId: target.id,
        targetName: target.name,
        type,
        strength,
        reason,
      });
    }
  }

  // Sort: high → medium → low, then by type
  const strengthOrder: Record<CouplingStrength, number> = { high: 0, medium: 1, low: 2 };
  couplings.sort((a, b) => strengthOrder[a.strength] - strengthOrder[b.strength]);

  return couplings;
}

// ── Coupling type inference ──────────────────────────────────────────

function inferCouplingType(
  source: MemorSystem,
  target: MemorSystem,
  relation: string,
  primaryCenterId?: string
): CouplingType {
  const sn = source.name.toLowerCase();
  const tn = target.name.toLowerCase();

  // Integration: extends relationship (plugins, adapters)
  if (relation === "extends") return "integration";

  // Build: compiler → runtime, scripts → anything
  if (
    /compiler|babel|transform|codegen/i.test(sn) ||
    /compiler|babel|transform|codegen/i.test(tn)
  ) return "build";
  if (
    source.type === "support-system" && /scripts/i.test(source.rootPath)
  ) return "build";

  // API: only THE primary center (not just any isRepoCenter system)
  if (source.id === primaryCenterId || target.id === primaryCenterId) return "api";

  // Runtime: execution path dependencies
  if (
    /reconciler|scheduler|dom|renderer|server|client|runtime/i.test(sn) ||
    /reconciler|scheduler|dom|renderer|server|client|runtime/i.test(tn)
  ) return "runtime";

  return "runtime";
}

// ── Coupling strength inference ─────────────────────────────────────

function inferCouplingStrength(
  source: MemorSystem,
  target: MemorSystem,
  conn: { relation: string; reason: string; confidence: number },
  primaryCenterId?: string
): CouplingStrength {
  let score = 0;

  // Direct dependency = base strength
  if (conn.relation === "uses" || conn.relation === "extends") score += 2;
  if (conn.relation === "bridges") score += 1;

  // Multiple import signals = stronger
  if (/multiple.*import/i.test(conn.reason)) score += 2;
  if (/also a direct/i.test(conn.reason)) score += 1;

  // Bidirectional: both systems reference each other
  const reverseEdge = target.connections?.outgoing?.some(
    (c) => c.targetSystemId === source.id
  );
  if (reverseEdge) score += 2;

  // Core coupling: only THE primary center counts
  if (source.id === primaryCenterId || target.id === primaryCenterId) score += 1;

  // Both systems are primary tier = high coupling risk
  if (source.systemTier === "primary" && target.systemTier === "primary") score += 1;

  // High confidence connection
  if (conn.confidence >= 0.8) score += 1;

  // Downgrade test/example connections
  if (/test|example|fixture|benchmark/i.test(source.name) ||
      /test|example|fixture|benchmark/i.test(target.name)) {
    score -= 2;
  }

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

// ── Reason generation ───────────────────────────────────────────────

function generateCouplingReason(
  source: MemorSystem,
  target: MemorSystem,
  type: CouplingType,
  strength: CouplingStrength,
  relation: string,
  primaryCenterId?: string
): string {
  const sn = source.name;
  const tn = target.name;

  if (type === "integration" && relation === "extends") {
    return `${sn} extends ${tn} — changes to ${tn}'s public interface directly affect ${sn}.`;
  }

  if (type === "build") {
    if (/compiler/i.test(sn))
      return `Compiler output from ${sn} feeds into ${tn}'s runtime execution.`;
    if (/compiler/i.test(tn))
      return `${sn} depends on compiled output from ${tn}.`;
    return `${sn} has a build-time dependency on ${tn}.`;
  }

  if (type === "api") {
    if (source.id === primaryCenterId)
      return `${tn} depends on ${sn}'s public API — changes to ${sn} propagate outward.`;
    if (target.id === primaryCenterId)
      return `${sn} depends on ${tn}'s public API surface — tightly coupled to the core interface.`;
    return `${sn} depends on ${tn}'s interface — API contract coupling.`;
  }

  // Runtime — specific patterns
  if (/reconciler/i.test(sn))
    return `${sn} uses ${tn}'s capabilities for tree reconciliation — core execution path.`;
  if (/reconciler/i.test(tn))
    return `${sn} depends on ${tn}'s reconciliation engine — changes to diffing logic propagate here.`;

  if (/scheduler/i.test(tn))
    return `${sn} relies on ${tn} for work scheduling and prioritization.`;
  if (/scheduler/i.test(sn))
    return `${sn} provides scheduling primitives consumed by ${tn}.`;

  if (/dom|renderer/i.test(sn) && !/devtools/i.test(sn))
    return `${sn} translates framework output into host-specific updates — renderer coupling with ${tn}.`;
  if (/dom|renderer/i.test(tn) && !/devtools/i.test(tn))
    return `${sn} feeds work into ${tn}'s rendering pipeline.`;

  if (/server/i.test(sn) || /server/i.test(tn))
    return `${sn} and ${tn} are coupled through server-side rendering paths.`;

  if (/shared|common/i.test(tn))
    return `${sn} consumes shared utilities from ${tn} — changes to ${tn} may ripple.`;

  if (strength === "high")
    return `${sn} has a strong runtime dependency on ${tn} — changes will likely propagate.`;

  return `${sn} depends on ${tn} at runtime.`;
}
