import type {
  MemorSystem,
  InternalArchitectureView,
  InternalNode,
  InternalEdge,
  InternalZoneKind,
} from "../types";

const LAYER_MAP: Record<InternalZoneKind, number> = {
  entry: 0,
  route: 0,
  "feature-area": 1,
  api: 1,
  ui: 2,
  logic: 2,
  state: 2,
  provider: 2,
  config: 3,
  support: 3,
};

function generateSummary(nodes: InternalNode[]): string {
  const entries = nodes.filter((n) => n.kind === "entry");
  const features = nodes.filter((n) => n.kind === "feature-area");
  const api = nodes.filter((n) => n.kind === "api");
  const shared = nodes.filter(
    (n) =>
      n.kind === "ui" ||
      n.kind === "logic" ||
      n.kind === "state" ||
      n.kind === "provider"
  );

  const parts: string[] = [];
  if (entries.length > 0)
    parts.push(`${entries.length} entry surface${entries.length > 1 ? "s" : ""}`);
  if (features.length > 0)
    parts.push(
      `${features.length} feature area${features.length > 1 ? "s" : ""}`
    );
  if (shared.length > 0)
    parts.push(`${shared.length} shared zone${shared.length > 1 ? "s" : ""}`);
  if (api.length > 0)
    parts.push(`${api.length} API surface${api.length > 1 ? "s" : ""}`);

  if (parts.length === 0) return "Minimal internal structure detected.";

  return `This system is organized around ${parts.join(", ")}.`;
}

function collapseThinFeatures(
  zones: InternalNode[],
  deps: { sourceZoneId: string; targetZoneId: string; importCount: number }[]
): InternalNode[] {
  const connectedIds = new Set<string>();
  for (const d of deps) {
    connectedIds.add(d.sourceZoneId);
    connectedIds.add(d.targetZoneId);
  }

  const thin: InternalNode[] = [];
  const kept: InternalNode[] = [];

  for (const n of zones) {
    if (
      n.kind === "feature-area" &&
      n.fileCount <= 2 &&
      !connectedIds.has(n.id)
    ) {
      thin.push(n);
    } else {
      kept.push(n);
    }
  }

  if (thin.length < 2) return zones;

  const totalFiles = thin.reduce((s, n) => s + n.fileCount, 0);
  kept.push({
    id: "zone-collapsed-pages",
    label: `${thin.length} pages`,
    kind: "feature-area",
    path: "",
    importance: 0.3,
    fileCount: totalFiles,
    layer: LAYER_MAP["feature-area"],
  });

  return kept;
}

export function buildInternalArchView(
  system: MemorSystem
): InternalArchitectureView | null {
  const s = system.internalStructure;
  if (!s || s.zones.length < 2) return null;

  let nodes: InternalNode[] = s.zones.map((z) => ({
    id: z.id,
    label: z.label,
    kind: z.kind,
    path: z.path,
    importance: z.importance,
    fileCount: z.fileCount,
    layer: LAYER_MAP[z.kind] ?? 2,
  }));

  nodes = collapseThinFeatures(nodes, s.dependencies);

  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges: InternalEdge[] = s.dependencies
    .filter((d) => nodeIds.has(d.sourceZoneId) && nodeIds.has(d.targetZoneId))
    .filter((d) => d.importCount >= 1)
    .map((d, i) => ({
      id: `iedge-${i}`,
      source: d.sourceZoneId,
      target: d.targetZoneId,
      relation: "uses" as const,
      weight: d.importCount,
    }));

  return {
    kind: "internal-architecture",
    systemId: system.id,
    systemName: system.name,
    title: `${system.name} — Internal Architecture`,
    summary: generateSummary(nodes),
    nodes,
    edges,
  };
}
