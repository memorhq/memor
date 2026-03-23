import type {
  ConnectionGraphEdge,
  ConnectionGraphNode,
  ConnectionGraphView,
} from "../types";
import { slugify } from "../utils/text";

// ── Layout constants ──────────────────────────────────────────────────

const NODE_H = 50;
const NODE_H_NO_SUB = 38;
const NODE_PADDING_X = 18;
const NODE_RADIUS = 6;
const LAYER_GAP = 130;
const ROW_GAP = 68;
const NODE_GAP_X = 24;
const MAX_ROW_WIDTH = 1100;
const MARGIN_TOP = 80;
const MARGIN_X = 40;
const MARGIN_BOTTOM = 60;
const FONT_SIZE = 13;
const SUB_FONT_SIZE = 9.5;

// Routing
const CORNER_R = 5;
const LANE_SPACING = 6;
const PORT_PADDING = 10;

// ── Colours ───────────────────────────────────────────────────────────

const TIER_FILL: Record<string, string> = {
  primary: "#1e293b",
  secondary: "#334155",
  support: "#64748b",
};
const TIER_TEXT: Record<string, string> = {
  primary: "#f8fafc",
  secondary: "#f1f5f9",
  support: "#f1f5f9",
};
const SUB_TEXT_COLOR = "#94a3b8";

const EDGE_COLOR: Record<string, string> = {
  uses: "#7c8da5",
  extends: "#3b82f6",
  bridges: "#d97706",
};
const EDGE_STROKE_BASE: Record<string, number> = {
  uses: 1.3,
  extends: 1.8,
  bridges: 1.8,
};

const CENTER_RING = "#eab308";
const LAYER_LABEL_COLOR = "#94a3b8";

// ── SVG helpers ───────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function measureLabel(text: string): number {
  return text.length * (FONT_SIZE * 0.58) + NODE_PADDING_X * 2;
}

function measureSubLabel(text: string): number {
  return text.length * (SUB_FONT_SIZE * 0.56) + NODE_PADDING_X * 2;
}

// ── Layout engine (nodes + rows) ──────────────────────────────────────

type LayoutNode = ConnectionGraphNode & {
  x: number;
  y: number;
  w: number;
  h: number;
};

function nodeHeight(n: ConnectionGraphNode): number {
  return n.subtitle ? NODE_H : NODE_H_NO_SUB;
}

function splitIntoRows(
  nodes: ConnectionGraphNode[],
  nodeWidths: Map<string, number>
): ConnectionGraphNode[][] {
  const rows: ConnectionGraphNode[][] = [];
  let current: ConnectionGraphNode[] = [];
  let currentW = 0;
  for (const n of nodes) {
    const w = nodeWidths.get(n.id)!;
    const needed = current.length === 0 ? w : w + NODE_GAP_X;
    if (currentW + needed > MAX_ROW_WIDTH && current.length > 0) {
      rows.push(current);
      current = [n];
      currentW = w;
    } else {
      current.push(n);
      currentW += needed;
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function computeLayout(view: ConnectionGraphView): {
  layoutNodes: LayoutNode[];
  canvasW: number;
  canvasH: number;
  layerLabels: Array<{ label: string; y: number }>;
} {
  const layers = new Map<number, ConnectionGraphNode[]>();
  for (const n of view.nodes) {
    const arr = layers.get(n.layer) || [];
    arr.push(n);
    layers.set(n.layer, arr);
  }
  const layerKeys = [...layers.keys()].sort((a, b) => a - b);

  const nodeWidths = new Map<string, number>();
  for (const n of view.nodes) {
    const labelW = measureLabel(n.label);
    const subW = n.subtitle ? measureSubLabel(n.subtitle) : 0;
    const centerBonus = n.isRepoCenter ? 12 : 0;
    nodeWidths.set(n.id, Math.max(labelW, subW, 80) + centerBonus);
  }

  type VisualRow = { layer: number; nodes: ConnectionGraphNode[]; width: number };
  const visualRows: VisualRow[] = [];
  for (const layer of layerKeys) {
    const nodes = layers.get(layer)!;
    const rows = splitIntoRows(nodes, nodeWidths);
    for (const row of rows) {
      let w = 0;
      for (const n of row) w += nodeWidths.get(n.id)! + NODE_GAP_X;
      w -= NODE_GAP_X;
      visualRows.push({ layer, nodes: row, width: Math.max(w, 0) });
    }
  }

  const maxRowWidth = Math.max(...visualRows.map((r) => r.width), 200);
  const canvasW = maxRowWidth + MARGIN_X * 2;
  const layoutNodes: LayoutNode[] = [];
  const layerLabels: Array<{ label: string; y: number }> = [];
  const tierNames: Record<number, string> = { 0: "Primary", 1: "Secondary", 2: "Support" };

  let currentY = MARGIN_TOP;
  let prevLayer = -1;
  for (let ri = 0; ri < visualRows.length; ri++) {
    const vr = visualRows[ri];
    const isNewLayer = vr.layer !== prevLayer;
    if (isNewLayer) {
      if (ri > 0) currentY += LAYER_GAP;
      layerLabels.push({ label: tierNames[vr.layer] || `Layer ${vr.layer}`, y: currentY - 20 });
    } else {
      currentY += ROW_GAP;
    }
    const startX = MARGIN_X + (maxRowWidth - vr.width) / 2;
    let curX = startX;
    for (const n of vr.nodes) {
      const w = nodeWidths.get(n.id)!;
      const h = nodeHeight(n);
      layoutNodes.push({ ...n, x: curX, y: currentY, w, h });
      curX += w + NODE_GAP_X;
    }
    prevLayer = vr.layer;
  }
  const maxH = Math.max(...layoutNodes.map((n) => n.h));
  const canvasH = currentY + maxH + MARGIN_BOTTOM;
  return { layoutNodes, canvasW, canvasH, layerLabels };
}

// ── Port assignment ───────────────────────────────────────────────────

type PortAssignment = {
  srcPortX: number;
  srcPortY: number;
  tgtPortX: number;
  tgtPortY: number;
};

function assignPorts(
  edges: ConnectionGraphEdge[],
  nodeMap: Map<string, LayoutNode>
): Map<string, PortAssignment> {
  // Count and sort outgoing/incoming per node
  const outgoing = new Map<string, ConnectionGraphEdge[]>();
  const incoming = new Map<string, ConnectionGraphEdge[]>();
  for (const e of edges) {
    const arr = outgoing.get(e.source) || [];
    arr.push(e);
    outgoing.set(e.source, arr);
    const arr2 = incoming.get(e.target) || [];
    arr2.push(e);
    incoming.set(e.target, arr2);
  }

  // Sort outgoing by target X center (left to right)
  for (const [nodeId, edgeList] of outgoing) {
    edgeList.sort((a, b) => {
      const ta = nodeMap.get(a.target);
      const tb = nodeMap.get(b.target);
      return (ta ? ta.x + ta.w / 2 : 0) - (tb ? tb.x + tb.w / 2 : 0);
    });
  }
  // Sort incoming by source X center
  for (const [nodeId, edgeList] of incoming) {
    edgeList.sort((a, b) => {
      const sa = nodeMap.get(a.source);
      const sb = nodeMap.get(b.source);
      return (sa ? sa.x + sa.w / 2 : 0) - (sb ? sb.x + sb.w / 2 : 0);
    });
  }

  const ports = new Map<string, PortAssignment>();

  function portPositions(node: LayoutNode, count: number): number[] {
    if (count <= 1) return [node.x + node.w / 2];
    const usable = node.w - PORT_PADDING * 2;
    const step = usable / (count - 1);
    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
      positions.push(node.x + PORT_PADDING + i * step);
    }
    return positions;
  }

  // Assign source ports
  const srcPortMap = new Map<string, Map<string, number>>();
  for (const [nodeId, edgeList] of outgoing) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const positions = portPositions(node, edgeList.length);
    const map = new Map<string, number>();
    for (let i = 0; i < edgeList.length; i++) {
      map.set(edgeList[i].id, positions[i]);
    }
    srcPortMap.set(nodeId, map);
  }

  // Assign target ports
  const tgtPortMap = new Map<string, Map<string, number>>();
  for (const [nodeId, edgeList] of incoming) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const positions = portPositions(node, edgeList.length);
    const map = new Map<string, number>();
    for (let i = 0; i < edgeList.length; i++) {
      map.set(edgeList[i].id, positions[i]);
    }
    tgtPortMap.set(nodeId, map);
  }

  for (const e of edges) {
    const src = nodeMap.get(e.source);
    const tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;

    const srcX = srcPortMap.get(e.source)?.get(e.id) ?? src.x + src.w / 2;
    const tgtX = tgtPortMap.get(e.target)?.get(e.id) ?? tgt.x + tgt.w / 2;

    ports.set(e.id, {
      srcPortX: srcX,
      srcPortY: src.y + src.h,
      tgtPortX: tgtX,
      tgtPortY: tgt.y,
    });
  }

  return ports;
}

// ── Lane assignment ───────────────────────────────────────────────────

function assignLanes(
  edges: ConnectionGraphEdge[],
  ports: Map<string, PortAssignment>
): Map<string, number> {
  // Group edges by corridor (approximate source-bottom to target-top Y band)
  type Corridor = { key: string; midY: number; edges: ConnectionGraphEdge[] };
  const corridorMap = new Map<string, Corridor>();

  for (const e of edges) {
    const p = ports.get(e.id);
    if (!p) continue;
    const srcBottom = p.srcPortY;
    const tgtTop = p.tgtPortY;
    // Round to nearest 10 to group same-gap edges
    const key = `${Math.round(srcBottom / 10) * 10}-${Math.round(tgtTop / 10) * 10}`;
    if (!corridorMap.has(key)) {
      corridorMap.set(key, { key, midY: (srcBottom + tgtTop) / 2, edges: [] });
    }
    corridorMap.get(key)!.edges.push(e);
  }

  const laneOffsets = new Map<string, number>();

  for (const corridor of corridorMap.values()) {
    const group = corridor.edges;
    // Sort by horizontal midpoint to reduce visual crossings
    group.sort((a, b) => {
      const pa = ports.get(a.id)!;
      const pb = ports.get(b.id)!;
      const midA = (pa.srcPortX + pa.tgtPortX) / 2;
      const midB = (pb.srcPortX + pb.tgtPortX) / 2;
      return midA - midB;
    });
    const halfN = (group.length - 1) / 2;
    for (let i = 0; i < group.length; i++) {
      laneOffsets.set(group[i].id, (i - halfN) * LANE_SPACING);
    }
  }

  return laneOffsets;
}

// ── Routed path generation ────────────────────────────────────────────

function buildRoutedPath(
  port: PortAssignment,
  laneOffset: number,
  sameRow: boolean
): string {
  const { srcPortX: sx, srcPortY: sy, tgtPortX: tx, tgtPortY: ty } = port;

  // Same-row: arc below both nodes from bottom to bottom
  if (sameRow) {
    const bottomY = Math.max(sy, ty);
    const midX = (sx + tx) / 2;
    const arcDrop = Math.min(28, Math.abs(tx - sx) * 0.22) + 12;
    return `M ${sx} ${bottomY} Q ${midX} ${bottomY + arcDrop} ${tx} ${bottomY}`;
  }

  // Straight down when horizontally aligned
  if (Math.abs(sx - tx) < 2) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }

  // Compute lane Y with offset
  const laneY = (sy + ty) / 2 + laneOffset;
  const r = Math.min(CORNER_R, Math.abs(laneY - sy) / 3, Math.abs(ty - laneY) / 3);

  if (r < 1) {
    return `M ${sx} ${sy} L ${sx} ${laneY} L ${tx} ${laneY} L ${tx} ${ty}`;
  }

  const goRight = tx > sx;
  const dirX = goRight ? 1 : -1;

  // Corner 1: vertical → horizontal at (sx, laneY)
  const c1StartY = laneY - r;
  const c1EndX = sx + dirX * r;

  // Corner 2: horizontal → vertical at (tx, laneY)
  const c2StartX = tx - dirX * r;
  const c2EndY = laneY + r;

  // Ensure corners don't overlap when the horizontal distance is very small
  if (Math.abs(tx - sx) < r * 3) {
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} L ${sx} ${laneY} Q ${sx} ${laneY} ${midX} ${laneY} Q ${tx} ${laneY} ${tx} ${laneY} L ${tx} ${ty}`;
  }

  return [
    `M ${sx} ${sy}`,
    `L ${sx} ${c1StartY}`,
    `Q ${sx} ${laneY} ${c1EndX} ${laneY}`,
    `L ${c2StartX} ${laneY}`,
    `Q ${tx} ${laneY} ${tx} ${c2EndY}`,
    `L ${tx} ${ty}`,
  ].join(" ");
}

// ── Edge visual properties ────────────────────────────────────────────

function edgeOpacity(edge: ConnectionGraphEdge, nodeMap: Map<string, LayoutNode>): number {
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return 0.25;
  const bothPrimary = src.tier === "primary" && tgt.tier === "primary";
  const oneCenter = src.isRepoCenter || tgt.isRepoCenter;
  const onePrimary = src.tier === "primary" || tgt.tier === "primary";
  if (bothPrimary) return 0.88;
  if (oneCenter) return 0.68;
  if (onePrimary) return 0.5;
  return 0.32;
}

function edgeWidth(edge: ConnectionGraphEdge, nodeMap: Map<string, LayoutNode>): number {
  const base = EDGE_STROKE_BASE[edge.relation] || 1.3;
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return base;
  if (src.tier === "primary" && tgt.tier === "primary") return base + 0.7;
  if (src.tier === "primary" || tgt.tier === "primary") return base + 0.2;
  return base;
}

// ── Arrow marker definitions ──────────────────────────────────────────

function arrowDefs(): string {
  const markers: string[] = [];
  for (const rel of ["uses", "extends", "bridges"] as const) {
    const color = EDGE_COLOR[rel];
    markers.push(`
      <marker id="arrow-${rel}" viewBox="0 0 10 6" refX="9" refY="3"
              markerWidth="7" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 3 L 0 6 z" fill="${color}" />
      </marker>`);
  }
  return `<defs>${markers.join("")}</defs>`;
}

// ── SVG rendering ─────────────────────────────────────────────────────

export function renderSvg(view: ConnectionGraphView): string {
  const { layoutNodes, canvasW, canvasH, layerLabels } = computeLayout(view);
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of layoutNodes) nodeMap.set(n.id, n);

  const reportSlug = slugify(view.repoName) || "repo";
  const reportFile = `${reportSlug}-memor-report.html`;

  // Compute routing
  const ports = assignPorts(view.edges, nodeMap);
  const lanes = assignLanes(view.edges, ports);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%">`
  );
  parts.push(arrowDefs());
  parts.push(`<rect width="${canvasW}" height="${canvasH}" fill="#ffffff" />`);

  // Layer labels
  for (const ll of layerLabels) {
    parts.push(
      `<text x="${MARGIN_X - 4}" y="${ll.y}" fill="${LAYER_LABEL_COLOR}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="500">${esc(ll.label)}</text>`
    );
  }

  // ── Edges ──────────────────────────────────────────────────────────
  for (const edge of view.edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;

    const port = ports.get(edge.id);
    if (!port) continue;
    const laneOffset = lanes.get(edge.id) ?? 0;
    const sameRow = Math.abs(src.y - tgt.y) < 5;

    const d = buildRoutedPath(port, laneOffset, sameRow);
    const color = EDGE_COLOR[edge.relation] || EDGE_COLOR.uses;
    const width = edgeWidth(edge, nodeMap);
    const opacity = edgeOpacity(edge, nodeMap);
    const dash = edge.relation === "bridges" ? ` stroke-dasharray="6,3"` : "";

    parts.push(
      `<path class="edge-path" data-source="${esc(edge.source)}" data-target="${esc(edge.target)}" d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash} opacity="${opacity}" marker-end="url(#arrow-${edge.relation})" />`
    );

    // Edge label for extends/bridges
    if (edge.relation !== "uses") {
      const mx = (port.srcPortX + port.tgtPortX) / 2;
      const my = (port.srcPortY + port.tgtPortY) / 2 + laneOffset;
      parts.push(
        `<text class="edge-label" data-source="${esc(edge.source)}" data-target="${esc(edge.target)}" x="${mx + 8}" y="${my - 3}" fill="${color}" font-size="9" font-family="-apple-system, BlinkMacSystemFont, sans-serif" opacity="0.8">${edge.relation}</text>`
      );
    }
  }

  // ── Nodes ──────────────────────────────────────────────────────────
  for (const node of layoutNodes) {
    const fill = TIER_FILL[node.tier] || TIER_FILL.support;
    const textFill = TIER_TEXT[node.tier] || TIER_TEXT.support;
    const focusSlug = node.focusSlug || slugify(node.label);
    const href = `${reportSlug}-focus-${focusSlug}.html`;

    parts.push(`<a xlink:href="${esc(href)}" target="_self" class="graph-node" data-node-id="${esc(node.id)}">`);

    if (node.isRepoCenter) {
      parts.push(
        `<rect x="${node.x - 3}" y="${node.y - 3}" width="${node.w + 6}" height="${node.h + 6}" rx="${NODE_RADIUS + 2}" fill="none" stroke="${CENTER_RING}" stroke-width="2.5" />`
      );
    }

    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${NODE_RADIUS}" fill="${fill}" class="node-rect" />`
    );

    if (node.subtitle) {
      const labelY = node.y + node.h / 2 - 6;
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${labelY}" fill="${textFill}" font-size="${FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="${node.tier === "primary" ? "600" : "400"}" text-anchor="middle" dominant-baseline="middle">${esc(node.label)}</text>`
      );
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${labelY + 15}" fill="${SUB_TEXT_COLOR}" font-size="${SUB_FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle" dominant-baseline="middle">${esc(node.subtitle)}</text>`
      );
    } else {
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2 + 1}" fill="${textFill}" font-size="${FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="${node.tier === "primary" ? "600" : "400"}" text-anchor="middle" dominant-baseline="middle">${esc(node.label)}</text>`
      );
    }

    parts.push("</a>");
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// ── Legend ─────────────────────────────────────────────────────────────

function renderLegendHtml(): string {
  const items: string[] = [];
  items.push(`<span class="legend-item"><span class="swatch" style="background:${TIER_FILL.primary}"></span> Primary</span>`);
  items.push(`<span class="legend-item"><span class="swatch" style="background:${TIER_FILL.secondary}"></span> Secondary</span>`);
  items.push(`<span class="legend-item"><span class="swatch" style="background:${TIER_FILL.support}"></span> Support</span>`);
  items.push(`<span class="legend-item"><span class="swatch" style="background:transparent;border:2px solid ${CENTER_RING}"></span> Repo center</span>`);
  items.push(`<span class="legend-item"><span class="edge-line" style="background:${EDGE_COLOR.uses}"></span> uses</span>`);
  items.push(`<span class="legend-item"><span class="edge-line" style="background:${EDGE_COLOR.extends}"></span> extends</span>`);
  items.push(`<span class="legend-item"><span class="edge-line edge-dashed" style="background:${EDGE_COLOR.bridges}"></span> bridges</span>`);
  return `<div class="legend">${items.join("")}</div>`;
}

// ── Hover interaction script ──────────────────────────────────────────

function hoverScript(): string {
  return `<script>
(function(){
  var svg = document.querySelector('.graph-container svg');
  if (!svg) return;
  var edges = svg.querySelectorAll('.edge-path');
  var labels = svg.querySelectorAll('.edge-label');
  var nodes = svg.querySelectorAll('.graph-node');
  var active = false;

  function setHover(nodeId) {
    active = true;
    edges.forEach(function(e) {
      var s = e.getAttribute('data-source');
      var t = e.getAttribute('data-target');
      if (s === nodeId || t === nodeId) {
        e.classList.add('edge-active');
        e.classList.remove('edge-dimmed');
      } else {
        e.classList.add('edge-dimmed');
        e.classList.remove('edge-active');
      }
    });
    labels.forEach(function(l) {
      var s = l.getAttribute('data-source');
      var t = l.getAttribute('data-target');
      if (s === nodeId || t === nodeId) {
        l.classList.add('edge-active');
        l.classList.remove('edge-dimmed');
      } else {
        l.classList.add('edge-dimmed');
        l.classList.remove('edge-active');
      }
    });
    nodes.forEach(function(n) {
      var nid = n.getAttribute('data-node-id');
      if (nid === nodeId) return;
      var connected = false;
      edges.forEach(function(e) {
        var s = e.getAttribute('data-source');
        var t = e.getAttribute('data-target');
        if ((s === nodeId && t === nid) || (t === nodeId && s === nid)) connected = true;
      });
      if (!connected) n.classList.add('node-dimmed');
    });
  }

  function clearHover() {
    active = false;
    edges.forEach(function(e) { e.classList.remove('edge-active','edge-dimmed'); });
    labels.forEach(function(l) { l.classList.remove('edge-active','edge-dimmed'); });
    nodes.forEach(function(n) { n.classList.remove('node-dimmed'); });
  }

  nodes.forEach(function(n) {
    n.addEventListener('mouseenter', function(ev) {
      ev.preventDefault();
      setHover(n.getAttribute('data-node-id'));
    });
    n.addEventListener('mouseleave', function() { clearHover(); });
  });
})();
</script>`;
}

// ── Full HTML page ────────────────────────────────────────────────────

export function renderConnectionGraphHtml(view: ConnectionGraphView): string {
  const svg = renderSvg(view);
  const legend = renderLegendHtml();
  const generated = new Date().toISOString();

  const css = `
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem 3rem; }
    .header { text-align: center; margin-bottom: 1.5rem; max-width: 56rem; }
    .header h1 { font-size: 1.35rem; font-weight: 500; color: #0f172a; margin-bottom: 0.35rem; }
    .header .summary { font-size: 0.95rem; color: #334155; margin-bottom: 0.3rem; line-height: 1.5; }
    .header .meta { font-size: 0.8rem; color: #94a3b8; line-height: 1.5; }
    .graph-container {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      overflow-x: auto;
      max-width: 100%;
    }
    .graph-container svg { display: block; min-width: 600px; }
    .graph-container svg a { cursor: pointer; }
    .graph-container svg .node-rect { transition: opacity 0.15s; }
    .graph-container svg a:hover .node-rect { opacity: 0.82; }
    .graph-container svg .edge-path { transition: opacity 0.2s, stroke-width 0.2s; }
    .graph-container svg .edge-active { opacity: 1 !important; stroke-width: 2.5 !important; }
    .graph-container svg .edge-dimmed { opacity: 0.08 !important; }
    .graph-container svg text.edge-dimmed { opacity: 0.05 !important; }
    .graph-container svg .node-dimmed .node-rect { opacity: 0.3; }
    .graph-container svg .node-dimmed text { opacity: 0.3; }
    .legend {
      display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center;
      margin-top: 1rem; padding: 0.75rem 1rem;
      background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;
      font-size: 0.8rem; color: #475569;
    }
    .legend-item { display: flex; align-items: center; gap: 0.35rem; }
    .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; }
    .edge-line { display: inline-block; width: 20px; height: 3px; border-radius: 1px; }
    .edge-dashed { background: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 9px) !important; }
    .hint { margin-top: 0.6rem; font-size: 0.75rem; color: #94a3b8; text-align: center; }
    .footer { margin-top: 1.5rem; font-size: 0.75rem; color: #94a3b8; }
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(view.title)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="header">
    <h1>${esc(view.title)}</h1>
    <p class="summary">${esc(view.summary)}</p>
    <p class="meta">${esc(view.description)}</p>
  </div>
  <div class="graph-container">
    ${svg}
  </div>
  ${legend}
  <p class="hint">Click a system to open its report. Hover to trace its connections.</p>
  <p class="footer">Memor V0 · ${esc(generated)}</p>
  ${hoverScript()}
</body>
</html>`;
}
