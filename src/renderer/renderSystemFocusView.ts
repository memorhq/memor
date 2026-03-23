import type {
  ConnectionGraphEdge,
  ConnectionGraphNode,
  SystemFocusView,
} from "../types";
import { slugify } from "../utils/text";

// ── Layout constants ──────────────────────────────────────────────────

const NODE_H = 48;
const NODE_H_NO_SUB = 38;
const NODE_PADDING_X = 16;
const NODE_RADIUS = 6;
const CENTER_EXTRA_W = 14;
const CENTER_EXTRA_H = 8;
const BAND_GAP = 100;
const NODE_GAP = 22;
const MARGIN = 36;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 36;
const FONT_SIZE = 13;
const SUB_FONT_SIZE = 9.5;

// ── Colours (consistent with main graph) ──────────────────────────────

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
const EDGE_STROKE: Record<string, number> = {
  uses: 1.4,
  extends: 1.8,
  bridges: 1.8,
};

const CENTER_RING = "#3b82f6";
const REPO_CENTER_RING = "#eab308";

// ── Helpers ───────────────────────────────────────────────────────────

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

// ── Layout engine ─────────────────────────────────────────────────────

type LayoutNode = ConnectionGraphNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  isCenter: boolean;
};

function nodeSize(
  n: ConnectionGraphNode,
  isCenter: boolean
): { w: number; h: number } {
  const labelW = measureLabel(n.label);
  const subW = n.subtitle ? measureSubLabel(n.subtitle) : 0;
  let w = Math.max(labelW, subW, 80);
  let h = n.subtitle ? NODE_H : NODE_H_NO_SUB;
  if (isCenter) {
    w += CENTER_EXTRA_W;
    h += CENTER_EXTRA_H;
  }
  return { w, h };
}

function computeFocusLayout(view: SystemFocusView): {
  layoutNodes: LayoutNode[];
  canvasW: number;
  canvasH: number;
} {
  const incoming = view.nodes.filter(
    (n) => n.layer === 0 && n.id !== view.centerSystemId
  );
  const outgoing = view.nodes.filter(
    (n) => n.layer === 2 && n.id !== view.centerSystemId
  );
  const centerNode = view.nodes.find((n) => n.id === view.centerSystemId)!;

  const sizes = new Map<string, { w: number; h: number }>();
  for (const n of view.nodes) {
    sizes.set(n.id, nodeSize(n, n.id === view.centerSystemId));
  }

  // Compute band widths
  function bandWidth(nodes: ConnectionGraphNode[]): number {
    if (nodes.length === 0) return 0;
    let w = 0;
    for (const n of nodes) w += sizes.get(n.id)!.w + NODE_GAP;
    return w - NODE_GAP;
  }

  const inW = bandWidth(incoming);
  const outW = bandWidth(outgoing);
  const centerW = sizes.get(centerNode.id)!.w;
  const contentW = Math.max(inW, outW, centerW);
  const canvasW = contentW + MARGIN * 2;

  const layoutNodes: LayoutNode[] = [];

  // Band Y positions
  const hasBandAbove = incoming.length > 0;
  const hasBandBelow = outgoing.length > 0;

  let centerY: number;
  if (hasBandAbove) {
    const inH = Math.max(...incoming.map((n) => sizes.get(n.id)!.h));
    centerY = MARGIN_TOP + inH + BAND_GAP;
  } else {
    centerY = MARGIN_TOP;
  }

  const cs = sizes.get(centerNode.id)!;
  layoutNodes.push({
    ...centerNode,
    x: MARGIN + (contentW - cs.w) / 2,
    y: centerY,
    w: cs.w,
    h: cs.h,
    isCenter: true,
  });

  // Incoming band (above center)
  if (incoming.length > 0) {
    const startX = MARGIN + (contentW - inW) / 2;
    let curX = startX;
    for (const n of incoming) {
      const s = sizes.get(n.id)!;
      layoutNodes.push({
        ...n,
        x: curX,
        y: MARGIN_TOP,
        w: s.w,
        h: s.h,
        isCenter: false,
      });
      curX += s.w + NODE_GAP;
    }
  }

  // Outgoing band (below center)
  if (outgoing.length > 0) {
    const outY = centerY + cs.h + BAND_GAP;
    const startX = MARGIN + (contentW - outW) / 2;
    let curX = startX;
    for (const n of outgoing) {
      const s = sizes.get(n.id)!;
      layoutNodes.push({
        ...n,
        x: curX,
        y: outY,
        w: s.w,
        h: s.h,
        isCenter: false,
      });
      curX += s.w + NODE_GAP;
    }
  }

  const maxY = Math.max(...layoutNodes.map((n) => n.y + n.h));
  const canvasH = maxY + MARGIN_BOTTOM;

  return { layoutNodes, canvasW, canvasH };
}

// ── Edge paths (smooth curves) ────────────────────────────────────────

function edgePath(
  src: LayoutNode,
  tgt: LayoutNode
): string {
  const sx = src.x + src.w / 2;
  const sy = src.y + src.h;
  const tx = tgt.x + tgt.w / 2;
  const ty = tgt.y;

  const dy = ty - sy;
  const cpOffset = Math.max(Math.abs(dy) * 0.45, 30);
  return `M ${sx} ${sy} C ${sx} ${sy + cpOffset}, ${tx} ${ty - cpOffset}, ${tx} ${ty}`;
}

// ── Arrow defs ────────────────────────────────────────────────────────

function arrowDefs(): string {
  const markers: string[] = [];
  for (const rel of ["uses", "extends", "bridges"] as const) {
    const color = EDGE_COLOR[rel];
    markers.push(`
      <marker id="fa-${rel}" viewBox="0 0 10 6" refX="9" refY="3"
              markerWidth="7" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 3 L 0 6 z" fill="${color}" />
      </marker>`);
  }
  return `<defs>${markers.join("")}</defs>`;
}

// ── SVG rendering ─────────────────────────────────────────────────────

export function renderFocusSvg(view: SystemFocusView): string {
  const { layoutNodes, canvasW, canvasH } = computeFocusLayout(view);
  const nodeMap = new Map<string, LayoutNode>();
  for (const n of layoutNodes) nodeMap.set(n.id, n);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%">`
  );
  parts.push(arrowDefs());
  parts.push(`<rect width="${canvasW}" height="${canvasH}" fill="#ffffff" />`);

  // Edges
  for (const edge of view.edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;

    const d = edgePath(src, tgt);
    const color = EDGE_COLOR[edge.relation] || EDGE_COLOR.uses;
    const width = EDGE_STROKE[edge.relation] || 1.4;
    const dash = edge.relation === "bridges" ? ` stroke-dasharray="6,3"` : "";
    const opacity = edge.emphasis === "strong" ? 0.8 : 0.55;

    parts.push(
      `<path class="focus-edge" data-source="${esc(edge.source)}" data-target="${esc(edge.target)}" d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${dash} opacity="${opacity}" marker-end="url(#fa-${edge.relation})" />`
    );

    // Edge label for extends/bridges
    if (edge.relation !== "uses") {
      const mx = (src.x + src.w / 2 + tgt.x + tgt.w / 2) / 2;
      const my = (src.y + src.h + tgt.y) / 2;
      parts.push(
        `<text x="${mx + 8}" y="${my}" fill="${color}" font-size="9.5" font-family="-apple-system, BlinkMacSystemFont, sans-serif" opacity="0.85">${edge.relation}</text>`
      );
    }
  }

  // Nodes
  for (const node of layoutNodes) {
    const fill = TIER_FILL[node.tier] || TIER_FILL.support;
    const textFill = TIER_TEXT[node.tier] || TIER_TEXT.support;

    // Center links to report; neighbors link to their focus views (graph walking)
    const neighborSlug = node.focusSlug || slugify(node.label);
    const href = node.isCenter
      ? `${view.repoSlug}-memor-report.html#${node.systemId}`
      : `${view.repoSlug}-focus-${neighborSlug}.html`;

    parts.push(
      `<a xlink:href="${esc(href)}" target="_self" class="focus-node" data-node-id="${esc(node.id)}">`
    );

    // Center emphasis ring
    if (node.isCenter) {
      const ringColor = node.isRepoCenter ? REPO_CENTER_RING : CENTER_RING;
      parts.push(
        `<rect x="${node.x - 3}" y="${node.y - 3}" width="${node.w + 6}" height="${node.h + 6}" rx="${NODE_RADIUS + 2}" fill="none" stroke="${ringColor}" stroke-width="2.5" />`
      );
    }

    parts.push(
      `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${NODE_RADIUS}" fill="${fill}" class="node-rect" />`
    );

    if (node.subtitle) {
      const labelY = node.y + node.h / 2 - 6;
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${labelY}" fill="${textFill}" font-size="${FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="${node.isCenter || node.tier === "primary" ? "600" : "400"}" text-anchor="middle" dominant-baseline="middle">${esc(node.label)}</text>`
      );
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${labelY + 15}" fill="${SUB_TEXT_COLOR}" font-size="${SUB_FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" text-anchor="middle" dominant-baseline="middle">${esc(node.subtitle)}</text>`
      );
    } else {
      parts.push(
        `<text x="${node.x + node.w / 2}" y="${node.y + node.h / 2 + 1}" fill="${textFill}" font-size="${FONT_SIZE}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="${node.isCenter || node.tier === "primary" ? "600" : "400"}" text-anchor="middle" dominant-baseline="middle">${esc(node.label)}</text>`
      );
    }

    parts.push("</a>");
  }

  parts.push("</svg>");
  return parts.join("\n");
}

// ── Hover interaction ─────────────────────────────────────────────────

function focusHoverScript(): string {
  return `<script>
(function(){
  var svg = document.querySelector('.focus-graph svg');
  if (!svg) return;
  var edges = svg.querySelectorAll('.focus-edge');
  var nodes = svg.querySelectorAll('.focus-node');

  function setHover(nodeId) {
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
    edges.forEach(function(e) { e.classList.remove('edge-active','edge-dimmed'); });
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

export function renderSystemFocusHtml(view: SystemFocusView): string {
  const svg = renderFocusSvg(view);
  const generated = new Date().toISOString();
  const graphFile = `${view.repoSlug}-connection-graph.html`;
  const reportFile = `${view.repoSlug}-memor-report.html#${view.centerSystemId}`;

  const tierLabel =
    view.centerTier === "primary"
      ? "Primary"
      : view.centerTier === "secondary"
        ? "Secondary"
        : "Support";

  const metaParts = [`Tier: ${tierLabel}`];
  if (view.centerRole) metaParts.push(view.centerRole);
  if (view.incomingCount > 0) metaParts.push(`Incoming: ${view.incomingCount}`);
  if (view.outgoingCount > 0) metaParts.push(`Outgoing: ${view.outgoingCount}`);

  const css = `
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 2rem 1rem 3rem; }
    .header { text-align: center; margin-bottom: 1.25rem; max-width: 48rem; }
    .header h1 { font-size: 1.25rem; font-weight: 500; color: #0f172a; margin-bottom: 0.3rem; }
    .header .summary { font-size: 0.92rem; color: #334155; line-height: 1.5; margin-bottom: 0.4rem; }
    .header .meta { font-size: 0.78rem; color: #94a3b8; }
    .focus-graph {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      overflow: visible;
      max-width: 100%;
    }
    .focus-graph svg { display: block; }
    .focus-graph svg a { cursor: pointer; }
    .focus-graph svg .node-rect { transition: opacity 0.15s; }
    .focus-graph svg a:hover .node-rect { opacity: 0.82; }
    .focus-graph svg .focus-edge { transition: opacity 0.2s, stroke-width 0.2s; }
    .focus-graph svg .edge-active { opacity: 1 !important; stroke-width: 2.5 !important; }
    .focus-graph svg .edge-dimmed { opacity: 0.08 !important; }
    .focus-graph svg .node-dimmed .node-rect { opacity: 0.3; }
    .focus-graph svg .node-dimmed text { opacity: 0.3; }
    .nav { display: flex; gap: 1.5rem; justify-content: center; margin-top: 1rem; font-size: 0.85rem; }
    .nav a { color: #3b82f6; text-decoration: none; }
    .nav a:hover { text-decoration: underline; }
    .hint { margin-top: 0.5rem; font-size: 0.72rem; color: #94a3b8; text-align: center; }
    .footer { margin-top: 1.5rem; font-size: 0.72rem; color: #94a3b8; }
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
    <p class="meta">${esc(metaParts.join(" · "))}</p>
  </div>
  <div class="focus-graph">
    ${svg}
  </div>
  <div class="nav">
    <a href="${esc(graphFile)}">← Connection Map</a>
    <a href="${esc(reportFile)}">Full Report →</a>
  </div>
  <p class="hint">Click a neighbor to see its focus view. Hover to trace connections.</p>
  <p class="footer">Memor V0 · ${esc(generated)}</p>
  ${focusHoverScript()}
</body>
</html>`;
}
