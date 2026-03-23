import type {
  ConnectionGraphEdge,
  ConnectionGraphGroup,
  ConnectionGraphNode,
  ConnectionGraphView,
  EdgeEmphasis,
  MemorSystem,
  RepoAnalysis,
  RepoMode,
  SystemTier,
} from "../types";
import { slugify } from "../utils/text";

// ── Subtitle derivation ───────────────────────────────────────────────

const ROLE_HINT_SUBTITLES: Record<string, string> = {
  "framework-core-package": "framework core",
  "framework-adapter-package": "adapter",
  "framework-tooling-package": "tooling",
  "primary-library-package": "primary library",
  "workflow-core-package": "workflow core",
  "workflow-provider-package": "provider",
  "workflow-support-package": "support",
};

const SUPPORT_ROLE_SUBTITLES: Record<string, string> = {
  "renderer-binding": "renderer binding",
  "adapter-bridge": "adapter bridge",
  "development-tooling": "dev tooling",
  "ecosystem-extension": "ecosystem",
  "shared-contracts": "shared contracts",
  "runtime-support": "runtime support",
  "packaging-distribution": "distribution",
  "docs-content": "docs",
  "test-harness": "test harness",
  "infra-config-support": "config",
  "devtools-instrumentation": "devtools",
  "cli-utility": "CLI",
  "workflow-logic": "workflow logic",
};

const ARCHETYPE_SUBTITLES: Record<string, string> = {
  "ui-library": "UI library",
  "database-package": "database",
  "config-package": "config",
  "types-package": "types",
  "integration-package": "integration",
  "feature-package": "features",
  "localization-package": "i18n",
  "email-package": "email",
  "platform-package": "platform",
  "tooling-package": "tooling",
  "utility-package": "utility",
  "documentation-package": "docs",
  "embeddable-package": "embeddable",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max - 1);
  return (cut > max * 0.4 ? s.slice(0, cut) : s.slice(0, max - 1)) + "\u2026";
}

export function deriveSubtitle(sys: MemorSystem): string | undefined {
  if (sys.isRepoCenter) {
    return "core";
  }

  // Prefer the author-provided package.json description — it's the most useful
  if (sys.packageDescription) {
    return truncate(sys.packageDescription, 50);
  }

  if (sys.systemRoleHint && sys.systemRoleHint !== "unknown") {
    const h = ROLE_HINT_SUBTITLES[sys.systemRoleHint];
    if (h) return h;
  }
  if (sys.packageArchetype && sys.packageArchetype !== "unknown") {
    const a = ARCHETYPE_SUBTITLES[sys.packageArchetype];
    if (a) return a;
  }
  if (sys.type === "web-app") return "app";
  if (sys.type === "api-service") return "API";
  if (sys.type === "docs-site") return "docs";
  if (sys.inferredSupportRole) {
    const sr = SUPPORT_ROLE_SUBTITLES[sys.inferredSupportRole];
    if (sr) return sr;
  }
  return sys.type === "shared-package" ? "package" : undefined;
}

// ── Node selection ────────────────────────────────────────────────────

const MAX_GRAPH_NODES = 28;
const MIN_CONNECTIONS_FOR_SUPPORT = 2;

function connectionCount(sys: MemorSystem, minConf: number): number {
  if (!sys.connections) return 0;
  const out = sys.connections.outgoing.filter((c) => c.confidence >= minConf).length;
  const inc = sys.connections.incoming.filter((c) => c.confidence >= minConf).length;
  return out + inc;
}

function hasSpecialRelation(sys: MemorSystem): boolean {
  if (!sys.connections) return false;
  return sys.connections.outgoing.some(
    (c) => c.relation === "extends" || c.relation === "bridges"
  );
}

function selectNodes(analysis: RepoAnalysis): MemorSystem[] {
  const { systems } = analysis;
  if (systems.length <= 12) {
    return systems.filter(
      (s) => connectionCount(s, 0.50) > 0 || s.systemTier === "primary"
    );
  }

  const selected = new Set<string>();

  for (const s of systems) {
    if (s.systemTier === "primary") selected.add(s.id);
  }

  for (const s of systems) {
    if (s.systemTier === "secondary") {
      if (
        s.isRepoCenter ||
        connectionCount(s, 0.60) >= 2 ||
        hasSpecialRelation(s)
      ) {
        selected.add(s.id);
      }
    }
  }

  const supportCandidates = systems
    .filter(
      (s) =>
        s.systemTier === "support" &&
        !selected.has(s.id) &&
        connectionCount(s, 0.60) >= MIN_CONNECTIONS_FOR_SUPPORT
    )
    .sort(
      (a, b) =>
        connectionCount(b, 0.60) - connectionCount(a, 0.60) ||
        b.importanceScore - a.importanceScore
    );

  for (const s of supportCandidates) {
    if (selected.size >= MAX_GRAPH_NODES) break;
    const connsToSelected = (s.connections?.outgoing || []).some(
      (c) => selected.has(c.targetSystemId) && c.confidence >= 0.60
    ) || (s.connections?.incoming || []).some(
      (c) => selected.has(c.targetSystemId) && c.confidence >= 0.60
    );
    if (connsToSelected) selected.add(s.id);
  }

  return systems.filter((s) => selected.has(s.id));
}

// ── Smart grouping (reduces node count for readability) ───────────────

type CollapseInfo = {
  label: string;
  count: number;
  subtitle: string;
  memberNames: string[];
};

function collapseSiblingNodes(
  systems: MemorSystem[],
  edges: ConnectionGraphEdge[]
): {
  systems: MemorSystem[];
  edges: ConnectionGraphEdge[];
  collapseMap: Map<string, CollapseInfo>;
} {
  if (systems.length <= 6) {
    return { systems, edges, collapseMap: new Map() };
  }

  const collapseMap = new Map<string, CollapseInfo>();
  const removedIds = new Set<string>();
  const newGroupEdges: ConnectionGraphEdge[] = [];
  let edgeIdx = 1000;

  // Strategy 1: Group all nodes that "extends" the same target
  const extendsByTarget = new Map<string, MemorSystem[]>();
  for (const sys of systems) {
    if (sys.isRepoCenter) continue;
    const extEdges = edges.filter(
      (e) => e.source === sys.id && e.relation === "extends"
    );
    if (extEdges.length !== 1) continue;
    const targetId = extEdges[0].target;
    const arr = extendsByTarget.get(targetId) || [];
    arr.push(sys);
    extendsByTarget.set(targetId, arr);
  }

  for (const [targetId, members] of extendsByTarget) {
    if (members.length < 3) continue;
    const names = members.map((m) => m.name).sort();
    const repSys = members[0];
    const repId = repSys.id;

    const label = `${members.length} extensions`;
    const subtitle = names.join(" · ");

    collapseMap.set(repId, { label, count: members.length, subtitle, memberNames: names });

    for (const m of members.slice(1)) removedIds.add(m.id);

    // Collect all unique targets from all members' edges
    const allTargets = new Set<string>();
    for (const m of members) {
      for (const e of edges) {
        if (e.source === m.id && !removedIds.has(e.target)) allTargets.add(e.target);
      }
    }
    allTargets.add(targetId);

    for (const tgt of allTargets) {
      const origEdge = edges.find((e) => e.source === repId && e.target === tgt)
        || edges.find((e) => members.some((m) => m.id === e.source) && e.target === tgt);
      if (!origEdge) continue;
      newGroupEdges.push({
        id: `edge-g${edgeIdx++}`,
        source: repId,
        target: tgt,
        relation: origEdge.relation,
        confidence: origEdge.confidence,
        reason: `${members.length} packages`,
        emphasis: "strong",
      });
    }
  }

  // Strategy 2: Group remaining support nodes sharing a long name prefix + same tier
  {
    const remaining = systems.filter(
      (s) => !removedIds.has(s.id) && !collapseMap.has(s.id) && s.systemTier === "support" && !s.isRepoCenter
    );
    const prefixGroups = new Map<string, MemorSystem[]>();
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const a = remaining[i].name;
        const b = remaining[j].name;
        let pLen = 0;
        while (pLen < a.length && pLen < b.length && a[pLen] === b[pLen]) pLen++;
        if (pLen >= 8) {
          const prefix = a.slice(0, pLen).replace(/[-_.]$/, "");
          if (prefix.length >= 6) {
            const arr = prefixGroups.get(prefix) || [];
            if (!arr.find((s) => s.id === remaining[i].id)) arr.push(remaining[i]);
            if (!arr.find((s) => s.id === remaining[j].id)) arr.push(remaining[j]);
            prefixGroups.set(prefix, arr);
          }
        }
      }
    }
    // Merge overlapping prefix groups: keep the longest prefix
    const sortedPrefixes = [...prefixGroups.entries()].sort(
      (a, b) => b[1].length - a[1].length || b[0].length - a[0].length
    );
    const usedIds = new Set<string>();
    for (const [prefix, members] of sortedPrefixes) {
      const fresh = members.filter((m) => !usedIds.has(m.id) && !removedIds.has(m.id));
      if (fresh.length < 3) continue;
      const names = fresh.map((m) => m.name).sort();
      const repId = fresh[0].id;

      const shortPrefix = prefix.replace(/^react-/, "").replace(/^astro-/, "").replace(/^@[^/]+\//, "");
      const label = `${fresh.length} ${shortPrefix || "packages"}`;
      const subtitle = names.join(" · ");
      collapseMap.set(repId, { label, count: fresh.length, subtitle, memberNames: names });
      for (const m of fresh.slice(1)) removedIds.add(m.id);
      for (const m of fresh) usedIds.add(m.id);
    }
  }

  // Strategy 3: Group remaining support nodes with identical edge signatures
  if (systems.length - removedIds.size > 6) {
    const remaining = systems.filter(
      (s) => !removedIds.has(s.id) && !collapseMap.has(s.id) && s.systemTier === "support" && !s.isRepoCenter
    );
    const bySignature = new Map<string, MemorSystem[]>();
    for (const sys of remaining) {
      const outEdges = edges
        .filter((e) => e.source === sys.id && !removedIds.has(e.target))
        .sort((a, b) => a.target.localeCompare(b.target));
      if (outEdges.length === 0) continue;
      const sig = outEdges.map((e) => `${e.relation}:${e.target}`).join("|");
      const arr = bySignature.get(sig) || [];
      arr.push(sys);
      bySignature.set(sig, arr);
    }

    for (const members of bySignature.values()) {
      if (members.length < 3) continue;
      const names = members.map((m) => m.name).sort();
      const repId = members[0].id;
      const label = `${members.length} packages`;
      const subtitle = names.join(" · ");
      collapseMap.set(repId, { label, count: members.length, subtitle, memberNames: names });
      for (const m of members.slice(1)) removedIds.add(m.id);
    }
  }

  if (removedIds.size === 0) {
    return { systems, edges, collapseMap };
  }

  const keptSystems = systems.filter((s) => !removedIds.has(s.id));
  const keptIds = new Set(keptSystems.map((s) => s.id));

  // Rebuild edges
  const seenEdgeKeys = new Set<string>();
  const finalEdges: ConnectionGraphEdge[] = [];
  let eidx = 0;

  for (const e of edges) {
    if (removedIds.has(e.source) || removedIds.has(e.target)) continue;
    const key = `${e.source}→${e.target}→${e.relation}`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);
    finalEdges.push({ ...e, id: `edge-${eidx++}` });
  }

  for (const ge of newGroupEdges) {
    if (!keptIds.has(ge.source) || !keptIds.has(ge.target)) continue;
    const key = `${ge.source}→${ge.target}→${ge.relation}`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);
    finalEdges.push({ ...ge, id: `edge-${eidx++}` });
  }

  return { systems: keptSystems, edges: finalEdges, collapseMap };
}

// ── Edge filtering ────────────────────────────────────────────────────

function edgeBudget(nodeCount: number): number {
  return Math.max(12, Math.min(nodeCount * 2, 45));
}

type CandidateEdge = ConnectionGraphEdge & {
  sourceTier: SystemTier;
  targetTier: SystemTier;
};

function selectEdges(
  selectedSystems: MemorSystem[],
  allSystems: MemorSystem[]
): ConnectionGraphEdge[] {
  const includedIds = new Set(selectedSystems.map((s) => s.id));
  const tierById = new Map<string, SystemTier>();
  for (const s of selectedSystems) tierById.set(s.id, s.systemTier);

  const seen = new Set<string>();
  const candidates: CandidateEdge[] = [];
  let edgeIdx = 0;

  for (const sys of allSystems) {
    if (!sys.connections || !includedIds.has(sys.id)) continue;
    for (const conn of sys.connections.outgoing) {
      if (!includedIds.has(conn.targetSystemId)) continue;
      if (conn.relation === "used-by") continue;

      const minConf =
        conn.relation === "extends" || conn.relation === "bridges"
          ? 0.60
          : 0.75;
      if (conn.confidence < minConf) continue;

      const pairKey = `${sys.id}→${conn.targetSystemId}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const emphasis: EdgeEmphasis =
        conn.confidence >= 0.85 ? "strong" : "medium";

      candidates.push({
        id: `edge-${edgeIdx++}`,
        source: sys.id,
        target: conn.targetSystemId,
        relation: conn.relation as "uses" | "extends" | "bridges",
        confidence: conn.confidence,
        reason: conn.reason,
        emphasis,
        sourceTier: tierById.get(sys.id) || "support",
        targetTier: tierById.get(conn.targetSystemId) || "support",
      });
    }
  }

  const budget = edgeBudget(selectedSystems.length);
  if (candidates.length <= budget) {
    return candidates.map(({ sourceTier: _s, targetTier: _t, ...rest }) => rest);
  }

  function edgePriority(e: CandidateEdge): number {
    const bothPri =
      e.sourceTier === "primary" && e.targetTier === "primary" ? 4 : 0;
    const onePri =
      e.sourceTier === "primary" || e.targetTier === "primary" ? 2 : 0;
    const special =
      e.relation === "extends" || e.relation === "bridges" ? 1 : 0;
    return bothPri + onePri + special;
  }
  candidates.sort((a, b) => {
    const pa = edgePriority(a);
    const pb = edgePriority(b);
    if (pa !== pb) return pb - pa;
    return b.confidence - a.confidence;
  });

  return candidates
    .slice(0, budget)
    .map(({ sourceTier: _s, targetTier: _t, ...rest }) => rest);
}

// ── Layer assignment ──────────────────────────────────────────────────

const LAYER_MAP: Record<SystemTier, number> = {
  primary: 0,
  secondary: 1,
  support: 2,
};

function assignLayers(
  systems: MemorSystem[],
  edges: ConnectionGraphEdge[],
  collapseMap: Map<string, CollapseInfo>
): ConnectionGraphNode[] {
  const nodes: ConnectionGraphNode[] = systems.map((s) => {
    const collapsed = collapseMap.get(s.id);
    return {
      id: s.id,
      label: collapsed ? collapsed.label : s.name,
      systemId: s.id,
      tier: s.systemTier,
      type: s.type,
      isRepoCenter: s.isRepoCenter || undefined,
      roleHint:
        s.systemRoleHint && s.systemRoleHint !== "unknown"
          ? s.systemRoleHint
          : undefined,
      importance: s.importanceScore,
      layer: s.isRepoCenter ? 0 : LAYER_MAP[s.systemTier],
      subtitle: collapsed ? collapsed.subtitle : deriveSubtitle(s),
      tech: collapsed ? undefined : s.detectedTech?.slice(0, 4),
      collapsedCount: collapsed ? collapsed.count : undefined,
      memberNames: collapsed ? collapsed.memberNames : undefined,
      focusSlug: slugify(s.name),
    };
  });

  reorderByBarycenter(nodes, edges);
  return nodes;
}

function reorderByBarycenter(
  nodes: ConnectionGraphNode[],
  edges: ConnectionGraphEdge[]
): void {
  for (const targetLayer of [1, 2]) {
    const layerNodes = nodes.filter((n) => n.layer === targetLayer);
    if (layerNodes.length <= 1) continue;

    const prevLayerNodes = nodes.filter((n) => n.layer < targetLayer);
    if (prevLayerNodes.length === 0) continue;

    const prevIndex = new Map<string, number>();
    prevLayerNodes.forEach((n, i) => prevIndex.set(n.id, i));

    const barycenters = new Map<string, number>();
    for (const node of layerNodes) {
      const positions: number[] = [];
      for (const e of edges) {
        if (e.source === node.id && prevIndex.has(e.target)) {
          positions.push(prevIndex.get(e.target)!);
        }
        if (e.target === node.id && prevIndex.has(e.source)) {
          positions.push(prevIndex.get(e.source)!);
        }
      }
      barycenters.set(
        node.id,
        positions.length > 0
          ? positions.reduce((a, b) => a + b, 0) / positions.length
          : Infinity
      );
    }

    layerNodes.sort((a, b) => {
      const ba = barycenters.get(a.id) ?? Infinity;
      const bb = barycenters.get(b.id) ?? Infinity;
      if (ba !== bb) return ba - bb;
      return b.importance - a.importance || a.label.localeCompare(b.label);
    });

    let insertIdx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].layer === targetLayer) {
        nodes[i] = layerNodes[insertIdx++];
      }
    }
  }

  // Layer 0: centers first, then importance
  const layer0 = nodes.filter((n) => n.layer === 0);
  layer0.sort((a, b) => {
    if (a.isRepoCenter && !b.isRepoCenter) return -1;
    if (!a.isRepoCenter && b.isRepoCenter) return 1;
    return b.importance - a.importance || a.label.localeCompare(b.label);
  });
  let l0idx = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].layer === 0) nodes[i] = layer0[l0idx++];
  }
}

// ── Grouping ──────────────────────────────────────────────────────────

function buildGroups(nodes: ConnectionGraphNode[]): ConnectionGraphGroup[] {
  const groups: ConnectionGraphGroup[] = [];
  const tiers: SystemTier[] = ["primary", "secondary", "support"];
  const tierLabels: Record<SystemTier, string> = {
    primary: "Primary systems",
    secondary: "Secondary systems",
    support: "Support systems",
  };
  for (const tier of tiers) {
    const tierNodes = nodes.filter((n) => n.tier === tier);
    if (tierNodes.length > 0) {
      groups.push({
        id: `group-${tier}`,
        label: tierLabels[tier],
        nodeIds: tierNodes.map((n) => n.id),
      });
    }
  }
  return groups;
}

// ── Summary sentence ──────────────────────────────────────────────────

function generateSummary(
  analysis: RepoAnalysis,
  nodes: ConnectionGraphNode[],
  edges: ConnectionGraphEdge[]
): string {
  const mode = analysis.repoMode;
  const primaryCount = nodes.filter((n) => n.layer === 0).length;
  const extendCount = edges.filter((e) => e.relation === "extends").length;
  const bridgeCount = edges.filter((e) => e.relation === "bridges").length;
  const centers = nodes.filter((n) => n.isRepoCenter);

  if (mode === "framework-core") {
    if (extendCount > 0) {
      return `Core framework packages sit at the top; ${extendCount > 3 ? "adapters and platform bindings" : "adapters"} extend outward below.`;
    }
    if (bridgeCount > 0) {
      return `Core runtime packages sit at the top; renderer and host-environment bindings fan out below.`;
    }
    return `${primaryCount} core framework packages form the top layer with supporting packages below.`;
  }

  if (mode === "library-tooling") {
    if (centers.length === 1) {
      return `Primary library at the center; supporting and tooling packages connect to it.`;
    }
    return `Library packages with supporting tooling and distribution packages.`;
  }

  if (mode === "surface-platform") {
    if (primaryCount >= 3) {
      return `Multiple application surfaces share a common package layer beneath them.`;
    }
    return `Application surfaces at the top with shared packages providing common functionality below.`;
  }

  if (mode === "product-domain-machine") {
    return `Primary surfaces at the top with shared domain and utility packages below.`;
  }

  if (mode === "workflow-platform") {
    if (extendCount > 0) {
      return `Core orchestration system with providers and support packages extending it.`;
    }
    return `Workflow platform core with supporting packages and extensions.`;
  }

  if (mode === "product-web-app") {
    return `Product web application with route surfaces, shared components, and data layers connected through API proxy handlers.`;
  }

  return `${nodes.length} systems shown with ${edges.length} connections between them.`;
}

// ── Description generation ────────────────────────────────────────────

function generateDescription(
  analysis: RepoAnalysis,
  nodes: ConnectionGraphNode[],
  edges: ConnectionGraphEdge[]
): string {
  const parts: string[] = [
    `${nodes.length} systems shown, ${edges.length} connections.`,
  ];
  const collapsed = nodes.filter((n) => n.collapsedCount);
  if (collapsed.length > 0) {
    const totalCollapsed = collapsed.reduce(
      (sum, n) => sum + (n.collapsedCount || 0),
      0
    );
    parts.push(`${totalCollapsed - collapsed.length} similar systems collapsed into ${collapsed.length} group${collapsed.length > 1 ? "s" : ""}.`);
  }
  const omitted = analysis.systems.length - nodes.length;
  if (omitted > 0) {
    parts.push(
      `${omitted} weakly connected system${omitted > 1 ? "s" : ""} omitted for clarity.`
    );
  }
  return parts.join(" ");
}

// ── Public API ────────────────────────────────────────────────────────

export function buildConnectionGraphView(
  analysis: RepoAnalysis
): ConnectionGraphView {
  const selectedSystems = selectNodes(analysis);
  let edges = selectEdges(selectedSystems, analysis.systems);

  // Collapse sibling groups to reduce visual noise
  const { systems: compressedSystems, edges: compressedEdges, collapseMap } =
    collapseSiblingNodes(selectedSystems, edges);
  edges = compressedEdges;

  const nodes = assignLayers(compressedSystems, edges, collapseMap);
  const groups = buildGroups(nodes);
  const summary = generateSummary(analysis, nodes, edges);
  const description = generateDescription(analysis, nodes, edges);

  return {
    kind: "connection-graph",
    repoName: analysis.repoName,
    repoMode: analysis.repoMode,
    title: `${analysis.repoName} — System Connection Map`,
    summary,
    description,
    nodes,
    edges,
    groups,
  };
}
