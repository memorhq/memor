import type {
  ConnectionGraphEdge,
  ConnectionGraphNode,
  EdgeEmphasis,
  MemorSystem,
  RepoAnalysis,
  SystemFocusView,
} from "../types";
import { slugify } from "../utils/text";
import { deriveSubtitle } from "./buildConnectionGraphView";

const MAX_FOCUS_NEIGHBORS = 9;

// ── Neighbor collection ───────────────────────────────────────────────

type Neighbor = {
  system: MemorSystem;
  direction: "incoming" | "outgoing";
  relation: "uses" | "extends" | "bridges";
  confidence: number;
  reason: string;
};

function findOriginalRelation(
  sourceSystem: MemorSystem,
  centerId: string
): "uses" | "extends" | "bridges" {
  if (!sourceSystem.connections) return "uses";
  const outConn = sourceSystem.connections.outgoing.find(
    (c) => c.targetSystemId === centerId
  );
  if (!outConn || outConn.relation === "used-by") return "uses";
  if (outConn.relation === "extends") return "extends";
  if (outConn.relation === "bridges") return "bridges";
  return "uses";
}

function collectNeighbors(
  center: MemorSystem,
  systemMap: Map<string, MemorSystem>
): Neighbor[] {
  const neighbors: Neighbor[] = [];
  const seen = new Set<string>();

  if (center.connections) {
    for (const conn of center.connections.outgoing) {
      if (conn.relation === "used-by") continue;
      const sys = systemMap.get(conn.targetSystemId);
      if (!sys || seen.has(sys.id)) continue;
      seen.add(sys.id);
      neighbors.push({
        system: sys,
        direction: "outgoing",
        relation: conn.relation as "uses" | "extends" | "bridges",
        confidence: conn.confidence,
        reason: conn.reason,
      });
    }

    for (const conn of center.connections.incoming) {
      const sys = systemMap.get(conn.targetSystemId);
      if (!sys || seen.has(sys.id)) continue;
      seen.add(sys.id);
      const originalRelation = findOriginalRelation(sys, center.id);
      neighbors.push({
        system: sys,
        direction: "incoming",
        relation: originalRelation,
        confidence: conn.confidence,
        reason: conn.reason,
      });
    }
  }

  return neighbors;
}

// ── Prioritization ────────────────────────────────────────────────────

function prioritizeNeighbors(neighbors: Neighbor[], max: number): Neighbor[] {
  return neighbors
    .sort((a, b) => {
      const relScore = (n: Neighbor) =>
        n.relation === "extends" ? 3 : n.relation === "bridges" ? 2 : 0;
      const tierScore = (n: Neighbor) =>
        n.system.systemTier === "primary"
          ? 3
          : n.system.systemTier === "secondary"
            ? 2
            : 0;
      const centerScore = (n: Neighbor) => (n.system.isRepoCenter ? 2 : 0);

      const sa =
        relScore(a) + tierScore(a) + centerScore(a) + a.confidence * 2;
      const sb =
        relScore(b) + tierScore(b) + centerScore(b) + b.confidence * 2;
      if (sb !== sa) return sb - sa;
      return b.system.importanceScore - a.system.importanceScore;
    })
    .slice(0, max);
}

// ── Summary generation ────────────────────────────────────────────────

function roleLabel(sys: MemorSystem): string {
  const sub = deriveSubtitle(sys);
  if (sub) return sub;
  if (sys.systemTier === "primary") return "primary system";
  if (sys.systemTier === "secondary") return "package";
  return "support package";
}

function generateFocusSummary(
  center: MemorSystem,
  incoming: Neighbor[],
  outgoing: Neighbor[]
): string {
  const role = roleLabel(center);
  const inCount = incoming.length;
  const outCount = outgoing.length;

  if (inCount === 0 && outCount === 0) {
    return `This ${role} is self-contained.`;
  }

  const extendsOut = outgoing.filter((n) => n.relation === "extends");
  const bridgesOut = outgoing.filter((n) => n.relation === "bridges");
  const extendsIn = incoming.filter((n) => n.relation === "extends");
  const bridgesIn = incoming.filter((n) => n.relation === "bridges");

  const nameList = (ns: Neighbor[], max: number) => {
    const names = ns.slice(0, max).map((n) => n.system.name);
    if (ns.length > max) names.push(`${ns.length - max} more`);
    return names.join(", ");
  };

  // Adapter pattern: extends something and is consumed by others
  if (extendsOut.length > 0) {
    const targets = nameList(extendsOut, 2);
    if (inCount > 0) {
      return `This ${role} extends ${targets} and is consumed by ${inCount} system${inCount > 1 ? "s" : ""}.`;
    }
    return `This ${role} extends ${targets}.`;
  }

  // Bridge pattern
  if (bridgesOut.length > 0) {
    const targets = nameList(bridgesOut, 2);
    if (inCount > 0) {
      return `This ${role} bridges ${targets} and serves ${inCount} dependent${inCount > 1 ? "s" : ""}.`;
    }
    return `This ${role} bridges ${targets}.`;
  }

  // Systems that are extended by others (core/common)
  if (extendsIn.length > 0) {
    const sources = nameList(extendsIn, 3);
    if (outCount > 0) {
      return `This ${role} is extended by ${sources} and depends on ${outCount} system${outCount > 1 ? "s" : ""}.`;
    }
    return `This ${role} is extended by ${sources}.`;
  }

  // Hub: both incoming and outgoing
  if (inCount > 0 && outCount > 0) {
    if (center.isRepoCenter) {
      return `This ${role} sits at the center, connecting ${outCount} dependenc${outCount > 1 ? "ies" : "y"} to ${inCount} dependent${inCount > 1 ? "s" : ""}.`;
    }
    return `This ${role} depends on ${nameList(outgoing, 2)} and is consumed by ${inCount} system${inCount > 1 ? "s" : ""}.`;
  }

  // Leaf consumer: only outgoing
  if (outCount > 0 && inCount === 0) {
    return `This ${role} depends on ${nameList(outgoing, 3)}.`;
  }

  // Pure dependency: only incoming
  if (inCount > 0 && outCount === 0) {
    return `This ${role} is consumed by ${nameList(incoming, 3)}.`;
  }

  return `This ${role} has ${inCount + outCount} connection${inCount + outCount > 1 ? "s" : ""}.`;
}

// ── Node + edge construction ──────────────────────────────────────────

function buildNode(
  sys: MemorSystem,
  layer: number
): ConnectionGraphNode {
  return {
    id: sys.id,
    label: sys.name,
    systemId: sys.id,
    tier: sys.systemTier,
    type: sys.type,
    isRepoCenter: sys.isRepoCenter || undefined,
    roleHint:
      sys.systemRoleHint && sys.systemRoleHint !== "unknown"
        ? sys.systemRoleHint
        : undefined,
    importance: sys.importanceScore,
    layer,
    subtitle: deriveSubtitle(sys),
    tech: sys.detectedTech?.slice(0, 4),
    focusSlug: slugify(sys.name),
  };
}

// ── Public API ────────────────────────────────────────────────────────

export function buildSystemFocusView(
  analysis: RepoAnalysis,
  systemId: string
): SystemFocusView | null {
  const systemMap = new Map(analysis.systems.map((s) => [s.id, s]));
  const center = systemMap.get(systemId);
  if (!center) return null;

  let neighbors = collectNeighbors(center, systemMap);
  if (neighbors.length > MAX_FOCUS_NEIGHBORS) {
    neighbors = prioritizeNeighbors(neighbors, MAX_FOCUS_NEIGHBORS);
  }

  const incoming = neighbors.filter((n) => n.direction === "incoming");
  const outgoing = neighbors.filter((n) => n.direction === "outgoing");

  // Build nodes: incoming at layer 0, center at layer 1, outgoing at layer 2
  const nodes: ConnectionGraphNode[] = [buildNode(center, 1)];
  for (const n of incoming) nodes.push(buildNode(n.system, 0));
  for (const n of outgoing) nodes.push(buildNode(n.system, 2));

  // Build edges
  const edges: ConnectionGraphEdge[] = [];
  let edgeIdx = 0;

  for (const n of outgoing) {
    const emphasis: EdgeEmphasis = n.confidence >= 0.85 ? "strong" : "medium";
    edges.push({
      id: `focus-edge-${edgeIdx++}`,
      source: center.id,
      target: n.system.id,
      relation: n.relation,
      confidence: n.confidence,
      reason: n.reason,
      emphasis,
    });
  }

  for (const n of incoming) {
    const emphasis: EdgeEmphasis = n.confidence >= 0.85 ? "strong" : "medium";
    edges.push({
      id: `focus-edge-${edgeIdx++}`,
      source: n.system.id,
      target: center.id,
      relation: n.relation,
      confidence: n.confidence,
      reason: n.reason,
      emphasis,
    });
  }

  const summary = generateFocusSummary(center, incoming, outgoing);
  const repoSlug = slugify(analysis.repoName) || "repo";

  return {
    kind: "system-focus",
    repoName: analysis.repoName,
    repoSlug,
    title: `${center.name} — System Focus`,
    summary,
    centerSystemId: center.id,
    centerSystemName: center.name,
    centerTier: center.systemTier,
    centerRole: roleLabel(center),
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    nodes,
    edges,
  };
}
