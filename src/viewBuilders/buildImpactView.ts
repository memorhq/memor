import type { ChangeImpactResult } from "../builders/analyzeChangeImpact";

export type ImpactNode = {
  id: string;
  label: string;
  ring: "center" | "direct" | "indirect";
  risk: "high" | "medium" | "low";
  zoneName: string;
};

export type ImpactEdge = {
  id: string;
  source: string;
  target: string;
  risk: "high" | "medium" | "low";
  label?: string;
};

export type ImpactView = {
  kind: "impact-map";
  center: ImpactNode;
  nodes: ImpactNode[];
  edges: ImpactEdge[];
};

/**
 * Build a focused blast-radius view model from an impact analysis result.
 * Center node = selected system. First ring = direct impacts. Second ring = indirect.
 */
export function buildImpactView(result: ChangeImpactResult): ImpactView {
  const center: ImpactNode = {
    id: result.selectedSystemId,
    label: result.selectedSystem,
    ring: "center",
    risk: "high",
    zoneName: "",
  };

  const nodes: ImpactNode[] = [center];
  const edges: ImpactEdge[] = [];

  for (const d of result.directImpacts) {
    nodes.push({
      id: d.systemId,
      label: d.systemName,
      ring: "direct",
      risk: d.risk,
      zoneName: d.zoneName,
    });
    edges.push({
      id: `${result.selectedSystemId}->${d.systemId}`,
      source: result.selectedSystemId,
      target: d.systemId,
      risk: d.risk,
    });
  }

  for (const i of result.indirectImpacts) {
    nodes.push({
      id: i.systemId,
      label: i.systemName,
      ring: "indirect",
      risk: i.risk,
      zoneName: i.zoneName,
    });
    // Connect through the intermediary
    const viaSystem = result.directImpacts.find((d) => i.via.includes(d.systemName));
    const sourceId = viaSystem?.systemId || result.selectedSystemId;
    edges.push({
      id: `${sourceId}->${i.systemId}`,
      source: sourceId,
      target: i.systemId,
      risk: i.risk,
      label: i.via.length > 0 ? `via ${i.via[0]}` : undefined,
    });
  }

  return { kind: "impact-map", center, nodes, edges };
}
