import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ConnectionGraphNode, InternalNode, InternalZoneKind } from "./types";

/* ── Tier styles ──────────────────────────────────────────────────── */

const TIER_STYLE: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  primary:   { bg: "#0f172a", border: "#334155", text: "#f8fafc", sub: "#94a3b8" },
  secondary: { bg: "#1e293b", border: "#334155", text: "#f1f5f9", sub: "#94a3b8" },
  support:   { bg: "#ffffff", border: "#e2e8f0", text: "#1e293b", sub: "#64748b" },
};

/* ── System node ──────────────────────────────────────────────────── */

export const SystemNode = memo(function SystemNode({
  data,
  selected,
}: NodeProps & { data: ConnectionGraphNode & { isCenter?: boolean } }) {
  const s = TIER_STYLE[data.tier] || TIER_STYLE.support;
  const isCenter = data.isRepoCenter || data.isCenter;
  const isCluster = data.memberNames && data.memberNames.length > 0;

  if (isCluster) {
    return (
      <>
        <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
        <div
          style={{
            background: "#f8fafc",
            border: "1.5px dashed #cbd5e1",
            borderRadius: 12,
            padding: "14px 20px",
            minWidth: 180,
            maxWidth: 320,
            cursor: "pointer",
            transition: "border-color .2s",
          }}
        >
          <div style={{
            fontWeight: 600,
            fontSize: 12,
            color: "#64748b",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            {data.label}
          </div>
          <div style={{
            fontSize: 12,
            color: "#334155",
            lineHeight: 1.6,
            maxWidth: 280,
          }}>
            {data.memberNames!.map((name, i) => (
              <span key={name}>
                {i > 0 && <span style={{ color: "#cbd5e1" }}> · </span>}
                <span style={{ fontWeight: 500 }}>{name}</span>
              </span>
            ))}
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      </>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          background: s.bg,
          color: s.text,
          border: `2px solid ${isCenter ? "#6366f1" : selected ? "#60a5fa" : s.border}`,
          borderRadius: 10,
          padding: "14px 24px",
          minWidth: 160,
          maxWidth: 260,
          textAlign: "center",
          boxShadow: isCenter
            ? "0 0 0 3px rgba(99,102,241,.18), 0 4px 16px rgba(0,0,0,.12)"
            : "0 1px 4px rgba(0,0,0,.06)",
          cursor: "pointer",
          transition: "box-shadow .2s, border-color .15s",
        }}
      >
        <div style={{
          fontWeight: 700,
          fontSize: 15,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}>
          {data.label}
        </div>
        {data.subtitle && (
          <div style={{
            fontSize: 11,
            color: s.sub,
            marginTop: 4,
            lineHeight: 1.35,
            maxWidth: 220,
          }}>
            {data.subtitle}
          </div>
        )}
        {data.tech && data.tech.length > 0 && (
          <div style={{
            display: "flex",
            gap: 4,
            marginTop: 5,
            justifyContent: "center",
            flexWrap: "wrap",
          }}>
            {data.tech.map((t) => (
              <span key={t} style={{
                fontSize: 9,
                padding: "1px 6px",
                borderRadius: 4,
                background: data.tier === "support"
                  ? "rgba(15,23,42,.06)"
                  : "rgba(255,255,255,.15)",
                color: data.tier === "support" ? "#64748b" : "rgba(255,255,255,.75)",
                lineHeight: 1.4,
                letterSpacing: "0.01em",
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

/* ── Zone kind colors ─────────────────────────────────────────────── */

const KIND_STYLE: Record<InternalZoneKind, { bg: string; text: string; sub: string }> = {
  entry:          { bg: "#1e40af", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  route:          { bg: "#1d4ed8", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  "feature-area": { bg: "#0e7490", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  ui:             { bg: "#7c3aed", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  logic:          { bg: "#334155", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  api:            { bg: "#b45309", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  state:          { bg: "#c2410c", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  provider:       { bg: "#047857", text: "#ffffff", sub: "rgba(255,255,255,.65)" },
  config:         { bg: "#e2e8f0", text: "#1e293b", sub: "#64748b" },
  support:        { bg: "#f1f5f9", text: "#334155", sub: "#94a3b8" },
};

/* ── Internal zone node ───────────────────────────────────────────── */

export const InternalZoneNode = memo(function InternalZoneNode({
  data,
}: NodeProps & { data: InternalNode }) {
  const s = KIND_STYLE[data.kind] || KIND_STYLE.support;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        style={{
          background: s.bg,
          color: s.text,
          borderRadius: 10,
          padding: "12px 22px",
          minWidth: 130,
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.1)",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>
          {data.label}
        </div>
        <div style={{ fontSize: 11, color: s.sub, marginTop: 3 }}>
          {data.kind}
          {data.fileCount > 0 && <span> {"\u00b7"} {data.fileCount} files</span>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

export const nodeTypes = {
  system: SystemNode as any,
  internalZone: InternalZoneNode as any,
};
