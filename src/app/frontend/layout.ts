import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB",
  opts?: { nodeWidth?: number; nodeHeight?: number; rankSep?: number; nodeSep?: number }
): { nodes: Node[]; edges: Edge[] } {
  const w = opts?.nodeWidth ?? 180;
  const h = opts?.nodeHeight ?? 60;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: opts?.nodeSep ?? 50,
    ranksep: opts?.rankSep ?? 70,
    marginx: 30,
    marginy: 30,
  });

  for (const node of nodes) {
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positioned = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });

  return { nodes: positioned, edges };
}
