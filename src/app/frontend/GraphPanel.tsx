import React, { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Controls,
  type Node,
  type Edge,
  type EdgeMarkerType,
  MarkerType,
} from "@xyflow/react";
import { nodeTypes } from "./nodes";
import { layoutGraph } from "./layout";
import type {
  ConnectionGraphView,
  ConnectionGraphEdge,
  InternalArchitectureView,
  InternalEdge,
  SystemFocusView,
} from "./types";

const EDGE_COLORS: Record<string, string> = {
  uses:    "#94a3b8",
  extends: "#6366f1",
  bridges: "#d97706",
};

const EDGE_LABELS: Record<string, string> = {
  extends: "extends",
  bridges: "bridges",
};

function makeMarker(relation: string): EdgeMarkerType {
  return {
    type: MarkerType.ArrowClosed,
    width: 14,
    height: 14,
    color: EDGE_COLORS[relation] || EDGE_COLORS.uses,
  };
}

function connectionEdgesToRF(edges: ConnectionGraphEdge[]): Edge[] {
  return edges.map((e) => {
    const isSpecial = e.relation === "extends" || e.relation === "bridges";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      animated: e.relation === "bridges",
      markerEnd: makeMarker(e.relation),
      style: {
        stroke: EDGE_COLORS[e.relation] || EDGE_COLORS.uses,
        strokeWidth: isSpecial ? 2 : 1.5,
        opacity: isSpecial ? 0.85 : 0.35,
      },
      label: EDGE_LABELS[e.relation],
      labelStyle: {
        fontSize: 10,
        fill: EDGE_COLORS[e.relation] || "#94a3b8",
        fontWeight: 600,
      },
      labelBgStyle: { fill: "#fafbfc", fillOpacity: 0.95 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  });
}

function internalEdgesToRF(edges: InternalEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: "#94a3b8",
    },
    style: {
      stroke: "#94a3b8",
      strokeWidth: Math.min(1.5 + e.weight * 0.25, 2.5),
      opacity: 0.3 + Math.min(e.weight * 0.05, 0.35),
    },
  }));
}

type GraphPanelProps = {
  connectionGraph: ConnectionGraphView | null;
  focusView: SystemFocusView | null;
  internalView: InternalArchitectureView | null;
  viewMode: "overview" | "focus" | "internal";
  onNodeClick: (systemId: string) => void;
};

export default function GraphPanel({
  connectionGraph,
  focusView,
  internalView,
  viewMode,
  onNodeClick,
}: GraphPanelProps) {
  const { nodes, edges } = useMemo(() => {
    if (viewMode === "internal" && internalView) {
      const raw: Node[] = internalView.nodes.map((n) => ({
        id: n.id, type: "internalZone", position: { x: 0, y: 0 }, data: { ...n },
      }));
      return layoutGraph(raw, internalEdgesToRF(internalView.edges), "TB", {
        nodeWidth: 200, nodeHeight: 64, rankSep: 80, nodeSep: 50,
      });
    }

    if (viewMode === "focus" && focusView) {
      const raw: Node[] = focusView.nodes.map((n) => ({
        id: n.id, type: "system", position: { x: 0, y: 0 },
        data: { ...n, isCenter: n.id === focusView.centerSystemId },
      }));
      return layoutGraph(raw, connectionEdgesToRF(focusView.edges), "TB", {
        nodeWidth: 240, nodeHeight: 80, rankSep: 100, nodeSep: 70,
      });
    }

    if (connectionGraph) {
      const hasCluster = connectionGraph.nodes.some((n) => n.memberNames && n.memberNames.length > 0);
      const raw: Node[] = connectionGraph.nodes.map((n) => ({
        id: n.id, type: "system", position: { x: 0, y: 0 }, data: { ...n },
      }));
      return layoutGraph(raw, connectionEdgesToRF(connectionGraph.edges), "TB", {
        nodeWidth: hasCluster ? 300 : 240,
        nodeHeight: hasCluster ? 90 : 80,
        rankSep: 110,
        nodeSep: hasCluster ? 50 : 70,
      });
    }

    return { nodes: [], edges: [] };
  }, [connectionGraph, focusView, internalView, viewMode]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (viewMode === "internal") return;
      const sysId = (node.data as any)?.systemId || node.id;
      onNodeClick(sysId as string);
    },
    [onNodeClick, viewMode]
  );

  if (nodes.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "#94a3b8", fontSize: 14,
      }}>
        No graph data available.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
      minZoom={0.15}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
    >
      <Controls
        showInteractive={false}
        position="bottom-right"
        style={{
          borderRadius: 8,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          background: "#ffffff",
          opacity: 0.5,
        }}
      />
    </ReactFlow>
  );
}
