import React, { useState, useCallback, useMemo, useEffect, memo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import { layoutGraph } from "./layout";
import type {
  AppData,
  RepoStory,
  RepoZone,
  RepoFlowSummary,
  KeyCoupling,
  MemorSystem,
  ChangeImpactResult,
  ImpactEntry,
} from "./types";

/* ================================================================
   TYPES
   ================================================================ */

type CanvasMode = "structure" | "flow" | "impact";
type DrillLevel = "zones" | "systems";
type DetailTab = "overview" | "couplings" | "impact" | "flow";

type CanvasAction =
  | { type: "go-zone"; name: string }
  | { type: "go-system"; id: string }
  | { type: "go-home" }
  | { type: "set-mode"; mode: CanvasMode }
  | { type: "set-flow"; flowId: string | null }
  | { type: "set-impact-target"; systemId: string | null }
  | { type: "start-here" }
  | { type: "riskiest" }
  | { type: "strongest-coupling" };

/* ================================================================
   CONSTANTS
   ================================================================ */

const RISK_COLORS: Record<string, string> = {
  local: "#22c55e",
  contained: "#eab308",
  broad: "#f97316",
  architectural: "#ef4444",
};

const RISK_BG: Record<string, string> = {
  local: "rgba(34,197,94,.12)",
  contained: "rgba(234,179,8,.12)",
  broad: "rgba(249,115,22,.12)",
  architectural: "rgba(239,68,68,.12)",
};

const TIER_BORDER: Record<string, string> = {
  primary: "#3b82f6",
  secondary: "#6366f1",
  support: "#475569",
};

/* ================================================================
   ZONE ICON
   ================================================================ */

function zoneIcon(name: string): string {
  const icons: Record<string, string> = {
    "Core Runtime": "◆", "Renderers & Bindings": "◇", "Compiler": "⚙",
    "DevTools": "🔧", "Testing & Fixtures": "✓", "Integrations": "⊕",
    "Adapters & Deployment": "▷", "Content & Markdown": "¶",
    "Language Tools": "◈", "CLI & Scaffolding": "▸",
    "Build & Tooling": "⚡", "Examples & Playgrounds": "△",
    "Marketing / Public Surface": "◎", "Dashboard / Product Surface": "◆",
    "API / BFF Layer": "⇄", "Auth & Onboarding": "◇",
    "Shared Components": "▣", "Data / Lib Layer": "▤",
    "State / Providers": "◉",
  };
  return icons[name] || "●";
}

/* ================================================================
   ZONE NODE
   ================================================================ */

const ZoneNode = memo(function ZoneNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className={[
          "cv-zone",
          d.isDimmed && "cv-dimmed",
          d.isStart && "cv-zone-start",
          d.impactLevel === "center" && "cv-impact-center",
          d.impactLevel === "direct" && "cv-impact-direct",
          d.impactLevel === "indirect" && "cv-impact-indirect",
          d.isFlowActive && "cv-flow-active",
        ].filter(Boolean).join(" ")}
      >
        <div className="cv-zone-top">
          <span className="cv-zone-icon">{d.icon || "●"}</span>
          <span className="cv-zone-name">{d.zoneName}</span>
          <span className="cv-zone-count">{d.systemCount}</span>
        </div>
        <div className="cv-zone-desc">{(d.description || "").slice(0, 100)}</div>
        <div className="cv-zone-bottom">
          {d.riskLevel && d.riskLevel !== "local" && (
            <span className="cv-zone-risk" style={{
              color: RISK_COLORS[d.riskLevel],
              background: RISK_BG[d.riskLevel],
            }}>{d.riskLevel}</span>
          )}
          {d.flowStep != null && (
            <span className="cv-zone-fstep">step {d.flowStep + 1}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

/* ================================================================
   SYSTEM NODE (CANVAS)
   ================================================================ */

const CanvasSystemNode = memo(function CanvasSystemNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className={[
          "cv-sys",
          d.isDimmed && "cv-dimmed",
          d.isSelected && "cv-sys-selected",
          d.impactLevel === "center" && "cv-impact-center",
          d.impactLevel === "direct" && "cv-impact-direct",
          d.impactLevel === "indirect" && "cv-impact-indirect",
        ].filter(Boolean).join(" ")}
        style={{ borderLeftColor: TIER_BORDER[d.tier] || "#475569" }}
      >
        <div className="cv-sys-name">{d.systemName}</div>
        <div className="cv-sys-meta">
          <span className="cv-sys-type">{d.type?.replace(/-/g, " ")}</span>
          {d.riskLevel && d.riskLevel !== "local" && (
            <span className="cv-sys-risk" style={{
              color: RISK_COLORS[d.riskLevel],
              background: RISK_BG[d.riskLevel],
            }}>{d.riskLevel}</span>
          )}
        </div>
        {d.description && <div className="cv-sys-desc">{d.description}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

/* ================================================================
   ADJACENT ZONE NODE (context in drilled view)
   ================================================================ */

const AdjacentZoneNode = memo(function AdjacentZoneNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="cv-adj-zone">
        <span className="cv-adj-icon">{d.icon || "●"}</span>
        <span className="cv-adj-name">{d.zoneName}</span>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
});

const canvasNodeTypes = {
  zone: ZoneNode as any,
  canvasSystem: CanvasSystemNode as any,
  adjacentZone: AdjacentZoneNode as any,
};

/* ================================================================
   DATA HELPERS
   ================================================================ */

function buildSysToZone(zones: RepoZone[], systems: MemorSystem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const zone of zones) {
    for (const id of zone.systemIds) map.set(id, zone.name);
    for (const name of zone.systemNames) {
      const sys = systems.find((s) => s.name === name);
      if (sys) map.set(sys.id, zone.name);
    }
  }
  return map;
}

function getZoneRisk(
  zone: RepoZone,
  impactResults?: Record<string, ChangeImpactResult>,
): string | undefined {
  if (!impactResults) return undefined;
  const levels = ["local", "contained", "broad", "architectural"];
  let max = 0;
  for (const sysId of zone.systemIds) {
    const lvl = impactResults[sysId]?.blastRadiusLevel;
    if (lvl) max = Math.max(max, levels.indexOf(lvl));
  }
  return max > 0 ? levels[max] : undefined;
}

function findStartZone(
  story: RepoStory,
  systems: MemorSystem[],
  sysToZone: Map<string, string>,
): string | null {
  const startSys = systems.find(
    (s) => s.name === story.readingOrder?.[0]?.systemName,
  );
  return startSys ? sysToZone.get(startSys.id) || null : null;
}

/* ================================================================
   ZONE-LEVEL GRAPH
   ================================================================ */

function computeZoneGraph(
  story: RepoStory,
  systems: MemorSystem[],
  impactResults: Record<string, ChangeImpactResult> | undefined,
  mode: CanvasMode,
  activeFlowId: string | null,
  flowStep: number,
  impactTargetId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const sysToZone = buildSysToZone(story.zones, systems);
  const startZone = findStartZone(story, systems, sysToZone);

  // --- zone nodes ---
  const zoneNodes: Node[] = story.zones.map((zone) => {
    const riskLevel = getZoneRisk(zone, impactResults);
    const isStart = zone.name === startZone;

    // flow matching
    let isFlowActive = false;
    let flowStepNum: number | undefined;
    if (mode === "flow" && activeFlowId) {
      const flow = story.flows.find((f) => f.id === activeFlowId);
      if (flow) {
        const idx = flow.steps.findIndex((s) => {
          const l = s.label.toLowerCase();
          return (
            zone.name.toLowerCase().includes(l) ||
            l.includes(zone.name.toLowerCase()) ||
            zone.systemNames.some((sn) => l.includes(sn.toLowerCase()))
          );
        });
        if (idx >= 0) {
          isFlowActive = true;
          flowStepNum = idx;
        }
      }
    }

    // impact matching
    let impactLevel: string | null = null;
    if (mode === "impact" && impactTargetId) {
      const targetZone = sysToZone.get(impactTargetId);
      if (targetZone === zone.name) {
        impactLevel = "center";
      } else {
        const impact = impactResults?.[impactTargetId];
        if (impact) {
          const dz = new Set(impact.directImpacts.map((d) => sysToZone.get(d.systemId)));
          const iz = new Set(impact.indirectImpacts.map((d) => sysToZone.get(d.systemId)));
          if (dz.has(zone.name)) impactLevel = "direct";
          else if (iz.has(zone.name)) impactLevel = "indirect";
        }
      }
    }

    const isDimmed = mode === "impact" && !!impactTargetId && !impactLevel;

    return {
      id: `zone-${zone.name}`,
      type: "zone",
      position: { x: 0, y: 0 },
      data: {
        zoneName: zone.name,
        systemCount: zone.systemNames.length,
        description: zone.description,
        icon: zoneIcon(zone.name),
        riskLevel,
        isStart,
        isDimmed,
        isFlowActive,
        flowStep: flowStepNum,
        impactLevel,
        systemNames: zone.systemNames,
      },
    };
  });

  // --- zone edges (aggregated from system connections + couplings) ---
  const edgeMap = new Map<string, { count: number; strength: string }>();

  for (const sys of systems) {
    const fromZone = sysToZone.get(sys.id);
    if (!fromZone || !sys.connections) continue;
    for (const conn of sys.connections.outgoing) {
      const toZone = sysToZone.get(conn.targetSystemId);
      if (toZone && toZone !== fromZone) {
        const key = [fromZone, toZone].sort().join("::");
        const ex = edgeMap.get(key);
        if (ex) ex.count++;
        else edgeMap.set(key, { count: 1, strength: "low" });
      }
    }
  }

  const strengths = ["low", "medium", "high"];
  for (const c of story.keyCouplings) {
    const fromSys = systems.find((s) => s.name === c.from);
    const toSys = systems.find((s) => s.name === c.to);
    if (!fromSys || !toSys) continue;
    const fz = sysToZone.get(fromSys.id);
    const tz = sysToZone.get(toSys.id);
    if (fz && tz && fz !== tz) {
      const key = [fz, tz].sort().join("::");
      const ex = edgeMap.get(key);
      if (ex) {
        if (strengths.indexOf(c.strength) > strengths.indexOf(ex.strength))
          ex.strength = c.strength;
      } else {
        edgeMap.set(key, { count: 1, strength: c.strength });
      }
    }
  }

  const zoneEdges: Edge[] = Array.from(edgeMap.entries()).map(([key, d], i) => {
    const [from, to] = key.split("::");
    const strong = d.strength === "high";
    const med = d.strength === "medium";
    return {
      id: `ze-${i}`,
      source: `zone-${from}`,
      target: `zone-${to}`,
      type: "smoothstep",
      style: {
        stroke: strong ? "#6366f1" : med ? "#94a3b8" : "#334155",
        strokeWidth: strong ? 2.5 : med ? 1.8 : 1.2,
        strokeDasharray: strong || med ? undefined : "6,4",
        opacity: 0.6,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 12,
        height: 12,
        color: strong ? "#6366f1" : "#64748b",
      },
      label: d.count > 2 ? `${d.count}` : undefined,
      labelStyle: { fontSize: 10, fill: "#64748b" },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.95 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
    };
  });

  // flow-mode overlay edges
  if (mode === "flow" && activeFlowId) {
    const flow = story.flows.find((f) => f.id === activeFlowId);
    if (flow) {
      const stepZones = flow.steps
        .map((s) => {
          const l = s.label.toLowerCase();
          return story.zones.find(
            (z) =>
              z.name.toLowerCase().includes(l) ||
              l.includes(z.name.toLowerCase()) ||
              z.systemNames.some((sn) => l.includes(sn.toLowerCase())),
          );
        })
        .filter(Boolean) as RepoZone[];

      for (let i = 0; i < stepZones.length - 1; i++) {
        const fromId = `zone-${stepZones[i].name}`;
        const toId = `zone-${stepZones[i + 1].name}`;
        if (fromId !== toId) {
          zoneEdges.push({
            id: `flow-e-${i}`,
            source: fromId,
            target: toId,
            type: "smoothstep",
            animated: i <= flowStep,
            style: {
              stroke: "#a855f7",
              strokeWidth: i <= flowStep ? 3 : 1.5,
              opacity: i <= flowStep ? 0.9 : 0.3,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 14,
              height: 14,
              color: "#a855f7",
            },
          });
        }
      }
    }
  }

  return layoutGraph(zoneNodes, zoneEdges, "TB", {
    nodeWidth: 300,
    nodeHeight: 140,
    rankSep: 160,
    nodeSep: 100,
  });
}

/* ================================================================
   SYSTEM-LEVEL GRAPH (drilled into a zone)
   ================================================================ */

function computeSystemGraph(
  story: RepoStory,
  systems: MemorSystem[],
  zoneName: string,
  impactResults: Record<string, ChangeImpactResult> | undefined,
  mode: CanvasMode,
  selectedSystemId: string | null,
  impactTargetId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const sysToZone = buildSysToZone(story.zones, systems);
  const zone = story.zones.find((z) => z.name === zoneName);
  if (!zone) return { nodes: [], edges: [] };

  const zoneSystems = zone.systemIds
    .map((id) => systems.find((s) => s.id === id))
    .filter(Boolean) as MemorSystem[];
  const zoneIdSet = new Set(zoneSystems.map((s) => s.id));

  // system nodes
  const sysNodes: Node[] = zoneSystems.map((sys) => {
    const impact = impactResults?.[sys.id];
    let impactLevel: string | null = null;
    if (mode === "impact" && impactTargetId) {
      if (sys.id === impactTargetId) impactLevel = "center";
      else {
        const ti = impactResults?.[impactTargetId];
        if (ti?.directImpacts.some((d) => d.systemId === sys.id)) impactLevel = "direct";
        else if (ti?.indirectImpacts.some((d) => d.systemId === sys.id)) impactLevel = "indirect";
      }
    }
    return {
      id: sys.id,
      type: "canvasSystem",
      position: { x: 0, y: 0 },
      data: {
        systemId: sys.id,
        systemName: sys.name,
        tier: sys.systemTier,
        type: sys.type,
        description: sys.description?.slice(0, 60),
        riskLevel: impact?.blastRadiusLevel,
        isCenter: sys.isRepoCenter,
        isDimmed: mode === "impact" && !!impactTargetId && !impactLevel,
        isSelected: sys.id === selectedSystemId,
        impactLevel,
      },
    };
  });

  // adjacent zone nodes
  const adjZones = new Set<string>();
  for (const sys of zoneSystems) {
    if (!sys.connections) continue;
    for (const c of [...sys.connections.outgoing, ...sys.connections.incoming]) {
      const oz = sysToZone.get(c.targetSystemId);
      if (oz && oz !== zoneName) adjZones.add(oz);
    }
  }
  const adjNodes: Node[] = Array.from(adjZones).slice(0, 6).map((zn) => ({
    id: `adj-${zn}`,
    type: "adjacentZone",
    position: { x: 0, y: 0 },
    data: { zoneName: zn, icon: zoneIcon(zn) },
  }));

  // edges
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const sys of zoneSystems) {
    if (!sys.connections) continue;
    for (const c of sys.connections.outgoing) {
      if (zoneIdSet.has(c.targetSystemId)) {
        const k = `${sys.id}->${c.targetSystemId}`;
        if (!seen.has(k)) {
          seen.add(k);
          edges.push({
            id: k,
            source: sys.id,
            target: c.targetSystemId,
            type: "smoothstep",
            style: { stroke: "#475569", strokeWidth: 1.5, opacity: 0.4 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: "#475569" },
          });
        }
      }
    }
    for (const c of sys.connections.outgoing) {
      const oz = sysToZone.get(c.targetSystemId);
      if (oz && oz !== zoneName && adjZones.has(oz)) {
        const k = `${sys.id}->adj-${oz}`;
        if (!seen.has(k)) {
          seen.add(k);
          edges.push({
            id: k,
            source: sys.id,
            target: `adj-${oz}`,
            type: "smoothstep",
            style: { stroke: "#334155", strokeWidth: 1, strokeDasharray: "4,3", opacity: 0.3 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#334155" },
          });
        }
      }
    }
    for (const c of sys.connections.incoming) {
      const oz = sysToZone.get(c.targetSystemId);
      if (oz && oz !== zoneName && adjZones.has(oz)) {
        const k = `adj-${oz}->${sys.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          edges.push({
            id: k,
            source: `adj-${oz}`,
            target: sys.id,
            type: "smoothstep",
            style: { stroke: "#334155", strokeWidth: 1, strokeDasharray: "4,3", opacity: 0.3 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8, color: "#334155" },
          });
        }
      }
    }
  }

  return layoutGraph([...sysNodes, ...adjNodes], edges, "TB", {
    nodeWidth: 220,
    nodeHeight: 80,
    rankSep: 100,
    nodeSep: 70,
  });
}

/* ================================================================
   MODE TOGGLE
   ================================================================ */

function ModeToggle({
  mode,
  onMode,
}: {
  mode: CanvasMode;
  onMode: (m: CanvasMode) => void;
}) {
  const modes: { key: CanvasMode; label: string; icon: string }[] = [
    { key: "structure", label: "Structure", icon: "◇" },
    { key: "flow", label: "Flow", icon: "▸" },
    { key: "impact", label: "Impact", icon: "◎" },
  ];
  return (
    <div className="cv-mode-toggle">
      {modes.map((m) => (
        <button
          key={m.key}
          className={`cv-mode-btn${mode === m.key ? " cv-mode-active" : ""}`}
          onClick={() => onMode(m.key)}
        >
          <span className="cv-mode-icon">{m.icon}</span>
          {m.label}
        </button>
      ))}
    </div>
  );
}

/* ================================================================
   BREADCRUMBS
   ================================================================ */

function Breadcrumbs({
  drill,
  selectedSystem,
  onHome,
  onZone,
}: {
  drill: { level: DrillLevel; zoneName: string | null };
  selectedSystem: MemorSystem | null;
  onHome: () => void;
  onZone: () => void;
}) {
  return (
    <div className="cv-breadcrumbs">
      <span
        className={`cv-crumb${drill.level === "zones" && !selectedSystem ? " cv-crumb-active" : ""}`}
        onClick={onHome}
      >
        Zones
      </span>
      {drill.zoneName && (
        <>
          <span className="cv-crumb-sep">›</span>
          <span
            className={`cv-crumb${!selectedSystem ? " cv-crumb-active" : ""}`}
            onClick={onZone}
          >
            {drill.zoneName}
          </span>
        </>
      )}
      {selectedSystem && (
        <>
          <span className="cv-crumb-sep">›</span>
          <span className="cv-crumb cv-crumb-active">{selectedSystem.name}</span>
        </>
      )}
    </div>
  );
}

/* ================================================================
   FLOW SELECTOR
   ================================================================ */

function FlowSelector({
  flows,
  activeFlowId,
  onSelect,
  flowStep,
  totalSteps,
}: {
  flows: RepoFlowSummary[];
  activeFlowId: string | null;
  onSelect: (id: string | null) => void;
  flowStep: number;
  totalSteps: number;
}) {
  return (
    <div className="cv-flow-selector">
      <select
        value={activeFlowId || ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="cv-flow-select"
      >
        <option value="">Select a flow…</option>
        {flows.map((f) => (
          <option key={f.id} value={f.id}>{f.title}</option>
        ))}
      </select>
      {activeFlowId && totalSteps > 0 && (
        <span className="cv-flow-progress">
          Step {flowStep + 1}/{totalSteps}
        </span>
      )}
    </div>
  );
}

/* ================================================================
   IMPACT TARGET SELECTOR
   ================================================================ */

function ImpactSelector({
  systems,
  targetId,
  onSelect,
  impactResults,
}: {
  systems: MemorSystem[];
  targetId: string | null;
  onSelect: (id: string | null) => void;
  impactResults?: Record<string, ChangeImpactResult>;
}) {
  const options = systems
    .filter((s) => impactResults?.[s.id])
    .sort((a, b) => {
      const sa = impactResults?.[a.id]?.blastRadiusScore || 0;
      const sb = impactResults?.[b.id]?.blastRadiusScore || 0;
      return sb - sa;
    });

  const target = targetId ? impactResults?.[targetId] : null;

  return (
    <div className="cv-impact-selector">
      <select
        value={targetId || ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="cv-impact-select"
      >
        <option value="">Select system…</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({impactResults?.[s.id]?.blastRadiusScore}/100)
          </option>
        ))}
      </select>
      {target && (
        <span
          className="cv-impact-badge"
          style={{
            color: RISK_COLORS[target.blastRadiusLevel],
            background: RISK_BG[target.blastRadiusLevel],
          }}
        >
          {target.blastRadiusScore}/100 {target.blastRadiusLevel}
        </span>
      )}
    </div>
  );
}

/* ================================================================
   DETAIL PANEL (RIGHT SIDE)
   ================================================================ */

function CanvasDetailPanel({
  system,
  data,
  tab,
  onTabChange,
  onSelect,
  onClose,
}: {
  system: MemorSystem;
  data: AppData;
  tab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const impact = data.impactResults?.[system.id];
  const story = data.repoStory;
  const sysToZone = story
    ? buildSysToZone(story.zones, data.analysis.systems)
    : new Map<string, string>();
  const zoneName = sysToZone.get(system.id) || "";

  const couplings = story?.keyCouplings.filter(
    (c) => c.from === system.name || c.to === system.name,
  ) || [];

  const flows = story?.flows.filter((f) =>
    f.steps.some((s) => s.label.toLowerCase().includes(system.name.toLowerCase())),
  ) || [];

  const tabs: { key: DetailTab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "couplings", label: "Couplings", count: couplings.length },
    { key: "impact", label: "Impact" },
    { key: "flow", label: "Flows", count: flows.length },
  ];

  return (
    <div className="cv-detail">
      <div className="cv-detail-header">
        <h3 className="cv-detail-name">{system.name}</h3>
        <button className="cv-detail-close" onClick={onClose}>✕</button>
      </div>
      <div className="cv-detail-badges">
        <span className={`cv-badge cv-tier-${system.systemTier}`}>{system.systemTier}</span>
        <span className="cv-badge cv-type">{system.type?.replace(/-/g, " ")}</span>
        {system.isRepoCenter && <span className="cv-badge cv-center">center</span>}
        {zoneName && <span className="cv-badge cv-zone-badge">{zoneName}</span>}
      </div>

      <div className="cv-detail-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`cv-tab-btn${tab === t.key ? " cv-tab-active" : ""}`}
            onClick={() => onTabChange(t.key)}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="cv-tab-count">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="cv-detail-body">
        {tab === "overview" && (
          <OverviewTab system={system} data={data} onSelect={onSelect} />
        )}
        {tab === "couplings" && (
          <CouplingsTab couplings={couplings} />
        )}
        {tab === "impact" && (
          <ImpactTab impact={impact || null} onSelect={onSelect} />
        )}
        {tab === "flow" && (
          <FlowsTab flows={flows} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  system,
  data,
  onSelect,
}: {
  system: MemorSystem;
  data: AppData;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {system.recommendedStartPath && (
        <div className="cv-detail-section">
          <h4>Start here</h4>
          <code className="cv-path">{system.recommendedStartPath}</code>
          {system.startPathReason && (
            <p className="cv-hint">{system.startPathReason}</p>
          )}
        </div>
      )}
      {system.detectedTech && system.detectedTech.length > 0 && (
        <div className="cv-detail-section">
          <h4>Tech</h4>
          <div className="cv-tags">
            {system.detectedTech.map((t) => (
              <span key={t} className="cv-tag">{t}</span>
            ))}
          </div>
        </div>
      )}
      {system.description && (
        <div className="cv-detail-section">
          <h4>About</h4>
          <p className="cv-desc">{system.description}</p>
        </div>
      )}
      {system.connections && system.connections.outgoing.length > 0 && (
        <div className="cv-detail-section">
          <h4>Dependencies</h4>
          {system.connections.outgoing.slice(0, 8).map((c) => (
            <div
              key={c.targetSystemId}
              className="cv-conn-item"
              onClick={() => onSelect(c.targetSystemId)}
            >
              <span className="cv-conn-name">{c.targetSystemName}</span>
              <span className="cv-conn-rel">{c.relation}</span>
            </div>
          ))}
        </div>
      )}
      {system.connections && system.connections.incoming.length > 0 && (
        <div className="cv-detail-section">
          <h4>Used by</h4>
          {system.connections.incoming.slice(0, 8).map((c) => (
            <div
              key={c.targetSystemId}
              className="cv-conn-item"
              onClick={() => onSelect(c.targetSystemId)}
            >
              <span className="cv-conn-name">{c.targetSystemName}</span>
              <span className="cv-conn-rel">{c.relation}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CouplingsTab({ couplings }: { couplings: KeyCoupling[] }) {
  if (couplings.length === 0)
    return <p className="cv-hint">No strong couplings detected.</p>;
  return (
    <>
      {couplings.map((c, i) => (
        <div key={i} className={`cv-coupling cv-coupling-${c.strength}`}>
          <div className="cv-coupling-pair">
            <span>{c.from}</span>
            <span className="cv-coupling-arrow">↔</span>
            <span>{c.to}</span>
          </div>
          <div className="cv-coupling-meta">
            <span className={`cv-coupling-str cv-str-${c.strength}`}>{c.strength}</span>
            <span className="cv-coupling-type">{c.type}</span>
          </div>
          <p className="cv-coupling-reason">{c.reason}</p>
        </div>
      ))}
    </>
  );
}

function ImpactTab({
  impact,
  onSelect,
}: {
  impact: ChangeImpactResult | null;
  onSelect: (id: string) => void;
}) {
  if (!impact) return <p className="cv-hint">No impact data available.</p>;
  return (
    <>
      <div
        className="cv-blast-badge"
        style={{
          color: RISK_COLORS[impact.blastRadiusLevel],
          background: RISK_BG[impact.blastRadiusLevel],
          borderColor: RISK_COLORS[impact.blastRadiusLevel],
        }}
      >
        <span className="cv-blast-score">{impact.blastRadiusScore}</span>
        <span className="cv-blast-max">/100</span>
        <span className="cv-blast-level">{impact.blastRadiusLevel}</span>
      </div>
      <p className="cv-impact-summary">{impact.summary}</p>

      {impact.directImpacts.length > 0 && (
        <div className="cv-detail-section">
          <h4>Directly affected ({impact.directImpacts.length})</h4>
          {impact.directImpacts.slice(0, 8).map((d) => (
            <div key={d.systemId} className="cv-impact-row" onClick={() => onSelect(d.systemId)}>
              <span className="cv-impact-name">{d.systemName}</span>
              <span className="cv-impact-risk" style={{ color: RISK_COLORS[d.risk] }}>{d.risk}</span>
              <p className="cv-impact-reason">{d.reason}</p>
            </div>
          ))}
        </div>
      )}

      {impact.indirectImpacts.length > 0 && (
        <div className="cv-detail-section">
          <h4>Indirectly affected ({impact.indirectImpacts.length})</h4>
          {impact.indirectImpacts.slice(0, 6).map((d) => (
            <div key={d.systemId} className="cv-impact-row" onClick={() => onSelect(d.systemId)}>
              <span className="cv-impact-name">{d.systemName}</span>
              <span className="cv-impact-risk" style={{ color: RISK_COLORS[d.risk] }}>{d.risk}</span>
              {d.via && d.via.length > 0 && (
                <span className="cv-impact-via">via {d.via.join(" → ")}</span>
              )}
              <p className="cv-impact-reason">{d.reason}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FlowsTab({ flows }: { flows: RepoFlowSummary[] }) {
  if (flows.length === 0) return <p className="cv-hint">No flows pass through this system.</p>;
  return (
    <>
      {flows.map((f) => (
        <div key={f.id} className="cv-flow-card">
          <div className="cv-flow-title">{f.title}</div>
          <div className="cv-flow-steps">
            {f.steps.map((s, i) => (
              <span key={i} className="cv-flow-step">
                {i > 0 && <span className="cv-flow-arrow">→</span>}
                {s.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

/* ================================================================
   AHA STRIP (top bar headline)
   ================================================================ */

function AhaStrip({ aha }: { aha: AppData["ahaSummary"] }) {
  if (!aha) return null;
  return (
    <div className="cv-aha-strip">
      <span className="cv-aha-headline">{aha.headline}</span>
      <span className="cv-aha-sub">{aha.subheadline}</span>
    </div>
  );
}

/* ================================================================
   INNER CANVAS (needs ReactFlowProvider)
   ================================================================ */

function CanvasInner({
  data,
  onAction,
}: {
  data: AppData;
  onAction?: (a: CanvasAction) => void;
}) {
  const story = data.repoStory;
  const systems = data.analysis.systems;
  const impactResults = data.impactResults;

  const [mode, setMode] = useState<CanvasMode>("structure");
  const [drill, setDrill] = useState<{ level: DrillLevel; zoneName: string | null }>({
    level: "zones",
    zoneName: null,
  });
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState(0);
  const [impactTargetId, setImpactTargetId] = useState<string | null>(null);

  const reactFlow = useReactFlow();

  // auto-select first flow when entering flow mode
  useEffect(() => {
    if (mode === "flow" && !activeFlowId && story?.flows.length) {
      setActiveFlowId(story.flows[0].id);
    }
  }, [mode, activeFlowId, story?.flows]);

  // auto-select riskiest system when entering impact mode
  useEffect(() => {
    if (mode === "impact" && !impactTargetId && impactResults) {
      let best: string | null = null;
      let bestScore = -1;
      for (const [id, r] of Object.entries(impactResults)) {
        if (r.blastRadiusScore > bestScore) {
          bestScore = r.blastRadiusScore;
          best = id;
        }
      }
      if (best) setImpactTargetId(best);
    }
  }, [mode, impactTargetId, impactResults]);

  // flow animation
  useEffect(() => {
    if (mode !== "flow" || !activeFlowId || !story) return;
    const flow = story.flows.find((f) => f.id === activeFlowId);
    if (!flow) return;
    const total = flow.steps.length;
    if (total === 0) return;
    setFlowStep(0);
    const iv = setInterval(() => {
      setFlowStep((s) => (s + 1) % total);
    }, 1800);
    return () => clearInterval(iv);
  }, [mode, activeFlowId, story]);

  // fit view on drill change
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlow.fitView({ padding: 0.2, duration: 400 });
    }, 100);
    return () => clearTimeout(timer);
  }, [drill.level, drill.zoneName, reactFlow]);

  // active flow total steps
  const activeFlowSteps = useMemo(() => {
    if (!activeFlowId || !story) return 0;
    return story.flows.find((f) => f.id === activeFlowId)?.steps.length || 0;
  }, [activeFlowId, story]);

  // compute graph
  const { nodes, edges } = useMemo(() => {
    if (!story || story.zones.length === 0) return { nodes: [], edges: [] };
    if (drill.level === "systems" && drill.zoneName) {
      return computeSystemGraph(
        story, systems, drill.zoneName,
        impactResults, mode, selectedSystemId, impactTargetId,
      );
    }
    return computeZoneGraph(
      story, systems, impactResults,
      mode, activeFlowId, flowStep, impactTargetId,
    );
  }, [story, systems, impactResults, drill, mode, activeFlowId, flowStep, impactTargetId, selectedSystemId]);

  const selectedSystem = selectedSystemId
    ? systems.find((s) => s.id === selectedSystemId) || null
    : null;

  // handlers
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "zone") {
        const zoneName = (node.data as any).zoneName;
        setDrill({ level: "systems", zoneName });
        setSelectedSystemId(null);
      } else if (node.type === "canvasSystem") {
        const sysId = (node.data as any).systemId;
        setSelectedSystemId(sysId);
        setDetailTab("overview");
        if (mode === "impact") setImpactTargetId(sysId);
      } else if (node.type === "adjacentZone") {
        const zoneName = (node.data as any).zoneName;
        setDrill({ level: "systems", zoneName });
        setSelectedSystemId(null);
      }
    },
    [mode],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedSystemId(null);
  }, []);

  const handleHome = useCallback(() => {
    setDrill({ level: "zones", zoneName: null });
    setSelectedSystemId(null);
  }, []);

  const handleZone = useCallback(() => {
    setSelectedSystemId(null);
  }, []);

  const handleSelectSystem = useCallback((id: string) => {
    const sys = systems.find((s) => s.id === id);
    if (sys) {
      const sysToZone = buildSysToZone(story!.zones, systems);
      const zn = sysToZone.get(id);
      if (zn) setDrill({ level: "systems", zoneName: zn });
      setSelectedSystemId(id);
      setDetailTab("overview");
    }
  }, [systems, story]);

  const handleCloseDetail = useCallback(() => {
    setSelectedSystemId(null);
  }, []);

  // dispatch external actions (from command bar)
  const handleAction = useCallback((action: CanvasAction) => {
    if (!story) return;
    switch (action.type) {
      case "go-home":
        handleHome();
        break;
      case "go-zone": {
        setDrill({ level: "systems", zoneName: action.name });
        setSelectedSystemId(null);
        break;
      }
      case "go-system": {
        handleSelectSystem(action.id);
        break;
      }
      case "set-mode":
        setMode(action.mode);
        break;
      case "set-flow":
        setMode("flow");
        setActiveFlowId(action.flowId);
        break;
      case "set-impact-target":
        setMode("impact");
        setImpactTargetId(action.systemId);
        break;
      case "start-here": {
        const startSys = systems.find(
          (s) => s.name === story.readingOrder?.[0]?.systemName,
        );
        if (startSys) handleSelectSystem(startSys.id);
        break;
      }
      case "riskiest": {
        if (impactResults) {
          let best: string | null = null;
          let bestScore = -1;
          for (const [id, r] of Object.entries(impactResults)) {
            if (r.blastRadiusScore > bestScore) {
              bestScore = r.blastRadiusScore;
              best = id;
            }
          }
          if (best) {
            setMode("impact");
            setImpactTargetId(best);
            handleSelectSystem(best);
          }
        }
        break;
      }
      case "strongest-coupling": {
        if (story.keyCouplings[0]) {
          const c = story.keyCouplings[0];
          const sys = systems.find((s) => s.name === c.from);
          if (sys) handleSelectSystem(sys.id);
          setDetailTab("couplings");
        }
        break;
      }
    }
  }, [story, systems, impactResults, handleHome, handleSelectSystem]);

  // expose action handler
  useEffect(() => {
    (window as any).__canvasAction = handleAction;
    return () => { delete (window as any).__canvasAction; };
  }, [handleAction]);

  if (!story || story.zones.length === 0) {
    return (
      <div className="cv-empty">
        <p>No architecture data available. The repo may need more systems for a canvas view.</p>
      </div>
    );
  }

  return (
    <div className="cv-root">
      {/* aha strip */}
      <AhaStrip aha={data.ahaSummary} />

      {/* toolbar */}
      <div className="cv-toolbar">
        <Breadcrumbs
          drill={drill}
          selectedSystem={selectedSystem}
          onHome={handleHome}
          onZone={handleZone}
        />
        <ModeToggle mode={mode} onMode={setMode} />
        {mode === "flow" && story.flows.length > 0 && (
          <FlowSelector
            flows={story.flows}
            activeFlowId={activeFlowId}
            onSelect={setActiveFlowId}
            flowStep={flowStep}
            totalSteps={activeFlowSteps}
          />
        )}
        {mode === "impact" && (
          <ImpactSelector
            systems={systems}
            targetId={impactTargetId}
            onSelect={setImpactTargetId}
            impactResults={impactResults}
          />
        )}
      </div>

      {/* main layout */}
      <div className="cv-body">
        <div className="cv-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={canvasNodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
            minZoom={0.1}
            maxZoom={1.8}
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
                boxShadow: "0 1px 4px rgba(0,0,0,.06)",
                background: "#ffffff",
              }}
            />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === "zone") return "#e2e8f0";
                if (node.type === "adjacentZone") return "#f1f5f9";
                return "#cbd5e1";
              }}
              maskColor="rgba(250,251,252,.7)"
              style={{
                background: "#ffffff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
              pannable
              zoomable
            />
          </ReactFlow>
        </div>

        {/* detail panel */}
        {selectedSystem && (
          <div className="cv-detail-pane">
            <CanvasDetailPanel
              system={selectedSystem}
              data={data}
              tab={detailTab}
              onTabChange={setDetailTab}
              onSelect={handleSelectSystem}
              onClose={handleCloseDetail}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   MAIN EXPORT
   ================================================================ */

export default function ArchitectureCanvas({
  data,
}: {
  data: AppData;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner data={data} />
    </ReactFlowProvider>
  );
}
