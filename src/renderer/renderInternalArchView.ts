import type { InternalArchitectureView, InternalNode, InternalZoneKind } from "../types";

const NODE_W = 140;
const NODE_H = 50;
const H_GAP = 28;
const V_GAP = 90;
const PAD = 40;

const KIND_COLORS: Record<InternalZoneKind, { bg: string; text: string }> = {
  entry:          { bg: "#1e40af", text: "#ffffff" },
  route:          { bg: "#1d4ed8", text: "#ffffff" },
  "feature-area": { bg: "#0e7490", text: "#ffffff" },
  ui:             { bg: "#7c3aed", text: "#ffffff" },
  logic:          { bg: "#334155", text: "#ffffff" },
  api:            { bg: "#b45309", text: "#ffffff" },
  state:          { bg: "#c2410c", text: "#ffffff" },
  provider:       { bg: "#047857", text: "#ffffff" },
  config:         { bg: "#94a3b8", text: "#1e293b" },
  support:        { bg: "#cbd5e1", text: "#334155" },
};

const EDGE_COLORS: Record<string, string> = {
  uses: "#64748b",
  "routes-to": "#3b82f6",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Pos = { x: number; y: number; w: number; h: number };

function computeLayout(
  view: InternalArchitectureView
): { positions: Map<string, Pos>; canvasW: number; canvasH: number } {
  const layers = new Map<number, InternalNode[]>();
  for (const n of view.nodes) {
    const arr = layers.get(n.layer) || [];
    arr.push(n);
    layers.set(n.layer, arr);
  }

  const sortedKeys = [...layers.keys()].sort((a, b) => a - b);
  let maxLayerW = 0;
  for (const nodes of layers.values()) {
    const w = nodes.length * NODE_W + (nodes.length - 1) * H_GAP;
    if (w > maxLayerW) maxLayerW = w;
  }

  const canvasW = maxLayerW + PAD * 2;
  const canvasH = sortedKeys.length * (NODE_H + V_GAP) - V_GAP + PAD * 2;
  const positions = new Map<string, Pos>();

  for (let li = 0; li < sortedKeys.length; li++) {
    const layerKey = sortedKeys[li];
    const nodes = layers.get(layerKey)!;
    const totalW = nodes.length * NODE_W + (nodes.length - 1) * H_GAP;
    const startX = (canvasW - totalW) / 2;
    const y = PAD + li * (NODE_H + V_GAP);

    for (let ni = 0; ni < nodes.length; ni++) {
      positions.set(nodes[ni].id, {
        x: startX + ni * (NODE_W + H_GAP),
        y,
        w: NODE_W,
        h: NODE_H,
      });
    }
  }

  return { positions, canvasW, canvasH };
}

export function renderInternalArchSvg(view: InternalArchitectureView): string {
  const { positions, canvasW, canvasH } = computeLayout(view);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${canvasW} ${canvasH}" width="100%" height="100%">`
  );

  parts.push("<defs>");
  parts.push(
    '<marker id="ia-arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8"/></marker>'
  );
  parts.push("</defs>");

  // Edges
  for (const edge of view.edges) {
    const sp = positions.get(edge.source);
    const tp = positions.get(edge.target);
    if (!sp || !tp) continue;

    const sx = sp.x + sp.w / 2;
    const sy = sp.y + sp.h;
    const tx = tp.x + tp.w / 2;
    const ty = tp.y;

    const color = EDGE_COLORS[edge.relation] || "#94a3b8";
    const opacity = Math.min(0.3 + edge.weight * 0.07, 0.85);
    const sw = Math.min(1 + edge.weight * 0.15, 2.5);

    const midY = (sy + ty) / 2;
    const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" opacity="${opacity}" marker-end="url(#ia-arrow)" class="ia-edge" data-source="${esc(edge.source)}" data-target="${esc(edge.target)}"/>`
    );
  }

  // Nodes
  for (const node of view.nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;

    const colors = KIND_COLORS[node.kind] || KIND_COLORS.logic;
    const rx = 8;

    parts.push(`<g class="ia-node" data-node-id="${esc(node.id)}">`);
    parts.push(
      `<rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="${rx}" fill="${colors.bg}" class="ia-rect"/>`
    );

    // Label
    const labelY = pos.y + 20;
    parts.push(
      `<text x="${pos.x + pos.w / 2}" y="${labelY}" text-anchor="middle" fill="${colors.text}" font-size="12" font-weight="500" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(node.label)}</text>`
    );

    // Kind badge
    const kindY = pos.y + 36;
    parts.push(
      `<text x="${pos.x + pos.w / 2}" y="${kindY}" text-anchor="middle" fill="${colors.text}" font-size="9" opacity="0.7" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${esc(node.kind)}</text>`
    );

    // File count
    if (node.fileCount > 1) {
      const fcX = pos.x + pos.w - 8;
      const fcY = pos.y + 12;
      parts.push(
        `<text x="${fcX}" y="${fcY}" text-anchor="end" fill="${colors.text}" font-size="9" opacity="0.5" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${node.fileCount}</text>`
      );
    }

    parts.push("</g>");
  }

  parts.push("</svg>");
  return parts.join("\n");
}
