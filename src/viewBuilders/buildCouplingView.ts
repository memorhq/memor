import type { Coupling } from "../builders/detectCouplings";
import type { RepoStory } from "../builders/generateRepoStory";

export type CouplingNode = {
  id: string;
  label: string;
  systemCount: number;
};

export type CouplingEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: "high" | "medium" | "low";
  reason: string;
};

export type CouplingView = {
  kind: "coupling-map";
  nodes: CouplingNode[];
  edges: CouplingEdge[];
};

/**
 * Lift system-level couplings to zone-level, producing a compact
 * "architecture tension map" showing how zones depend on each other.
 */
export function buildCouplingView(
  couplings: Coupling[],
  story: RepoStory
): CouplingView {
  // System → zone lookup
  const sysZone = new Map<string, string>();
  for (const zone of story.zones) {
    for (const id of zone.systemIds) {
      sysZone.set(id, zone.name);
    }
  }

  // Aggregate system-level couplings into zone-level edges
  const edgeMap = new Map<
    string,
    { type: string; strength: "high" | "medium" | "low"; reasons: string[] }
  >();
  const strengthRank: Record<string, number> = { high: 3, medium: 2, low: 1 };

  for (const c of couplings) {
    const srcZone = sysZone.get(c.sourceId) || "Other";
    const tgtZone = sysZone.get(c.targetId) || "Other";
    if (srcZone === tgtZone) continue; // skip intra-zone

    const key = [srcZone, tgtZone].sort().join("::");
    const existing = edgeMap.get(key);

    if (!existing) {
      edgeMap.set(key, { type: c.type, strength: c.strength, reasons: [c.reason] });
    } else {
      // Upgrade strength if this coupling is stronger
      if (strengthRank[c.strength] > strengthRank[existing.strength]) {
        existing.strength = c.strength;
      }
      if (existing.reasons.length < 3) {
        existing.reasons.push(c.reason);
      }
    }
  }

  // Build nodes from zones that participate in cross-zone couplings
  const involvedZones = new Set<string>();
  for (const key of edgeMap.keys()) {
    const [a, b] = key.split("::");
    involvedZones.add(a);
    involvedZones.add(b);
  }

  const nodes: CouplingNode[] = [];
  for (const zone of story.zones) {
    if (!involvedZones.has(zone.name)) continue;
    nodes.push({
      id: zone.name,
      label: zone.name,
      systemCount: zone.systemIds.length,
    });
  }

  // Add center if involved
  if (involvedZones.has("Other")) {
    nodes.push({ id: "Other", label: story.primaryCenter || "Center", systemCount: 1 });
  }

  const edges: CouplingEdge[] = [];
  for (const [key, val] of edgeMap) {
    const [src, tgt] = key.split("::");
    edges.push({
      id: `${src}->${tgt}`,
      source: src,
      target: tgt,
      type: val.type,
      strength: val.strength,
      reason: val.reasons[0],
    });
  }

  // Sort edges: high first
  edges.sort((a, b) => strengthRank[b.strength] - strengthRank[a.strength]);

  return { kind: "coupling-map", nodes, edges };
}
