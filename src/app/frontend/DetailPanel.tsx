import React from "react";
import type { AppData, MemorSystem, ChangeImpactResult, ImpactEntry } from "./types";

type DetailPanelProps = {
  data: AppData;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function SystemDetailPanel({
  sys,
  data,
  onSelect,
}: {
  sys: MemorSystem;
  data: AppData;
  onSelect: (id: string) => void;
}) {
  const fv = data.focusViews[sys.id];
  const iv = data.internalViews[sys.id];
  const impact = data.impactResults?.[sys.id] ?? null;

  return (
    <div className="drawer-body">
      {/* Name + badges */}
      <div className="drawer-header">
        <h2>{sys.name}</h2>
        <div className="detail-badges">
          <span className={`badge tier-${sys.systemTier}`}>{sys.systemTier}</span>
          <span className="badge type">{sys.type}</span>
          {sys.isRepoCenter && <span className="badge mode">center</span>}
        </div>
      </div>

      {/* Start path — the most useful piece of info */}
      {sys.recommendedStartPath && (
        <div className="detail-section">
          <h3>Start here</h3>
          <code className="start-path">{sys.recommendedStartPath}</code>
          {sys.startPathReason && <p className="detail-hint">{sys.startPathReason}</p>}
        </div>
      )}

      {/* Tech stack */}
      {sys.detectedTech && sys.detectedTech.length > 0 && (
        <div className="detail-section">
          <h3>Tech</h3>
          <div className="tag-wrap">
            {sys.detectedTech.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* About */}
      {sys.description && (
        <div className="detail-section">
          <h3>About</h3>
          <p>{sys.description}</p>
        </div>
      )}

      {/* Connections summary */}
      {fv && (fv.incomingCount > 0 || fv.outgoingCount > 0) && (
        <div className="detail-section">
          <h3>Connections</h3>
          <p>{fv.summary}</p>
          <p className="detail-hint">
            {[
              fv.incomingCount > 0 ? `${fv.incomingCount} incoming` : "",
              fv.outgoingCount > 0 ? `${fv.outgoingCount} outgoing` : "",
            ].filter(Boolean).join(" \u00b7 ")}
          </p>
        </div>
      )}

      {/* Internal structure summary */}
      {iv && (
        <div className="detail-section">
          <h3>Internal Structure</h3>
          <p>{iv.summary}</p>
          <p className="detail-hint">
            {iv.nodes.length} zones {"\u00b7"} {iv.edges.length} dependencies
          </p>
        </div>
      )}

      {/* Outgoing / incoming connections */}
      {sys.connections && sys.connections.outgoing.length > 0 && (
        <div className="detail-section">
          {groupByRelation(sys.connections.outgoing).map(([rel, items]) => (
            <div key={rel}>
              <div className="conn-group-label">{rel}</div>
              {items.map((c) => (
                <div className="conn-item" key={c.targetSystemId}>
                  <span className="conn-target" onClick={() => onSelect(c.targetSystemId)}>
                    {c.targetSystemName}
                  </span>
                  <span className="conn-conf">{Math.round(c.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {sys.connections && sys.connections.incoming.length > 0 && (
        <div className="detail-section">
          <div className="conn-group-label">used by</div>
          {sys.connections.incoming.slice(0, 6).map((c) => (
            <div className="conn-item" key={c.targetSystemId}>
              <span className="conn-target" onClick={() => onSelect(c.targetSystemId)}>
                {c.targetSystemName}
              </span>
              <span className="conn-conf">{Math.round(c.confidence * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Entry points */}
      {sys.entryPoints && sys.entryPoints.length > 0 && (
        <div className="detail-section">
          <h3>Entry points</h3>
          {sys.entryPoints.slice(0, 3).map((ep) => (
            <div key={ep.path} style={{ marginBottom: 6 }}>
              <code className="start-path" style={{ fontSize: 11, padding: "4px 8px" }}>
                {ep.path}
              </code>
              <span className="detail-hint" style={{ display: "block", marginTop: 2 }}>
                {ep.kind} {"\u00b7"} {ep.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Change Impact Analysis */}
      {impact && <ImpactPanel impact={impact} onSelect={onSelect} />}
    </div>
  );
}

function ImpactPanel({
  impact,
  onSelect,
}: {
  impact: ChangeImpactResult;
  onSelect: (id: string) => void;
}) {
  const levelColors: Record<string, string> = {
    local: "#16a34a",
    contained: "#ca8a04",
    broad: "#ea580c",
    architectural: "#dc2626",
  };
  const levelBg: Record<string, string> = {
    local: "#f0fdf4",
    contained: "#fffbeb",
    broad: "#fff7ed",
    architectural: "#fef2f2",
  };

  return (
    <div className="detail-section impact-section">
      <h3>Change Impact</h3>

      {/* Blast radius badge */}
      <div
        className="impact-blast-badge"
        style={{
          background: levelBg[impact.blastRadiusLevel] || "#f8fafc",
          borderColor: levelColors[impact.blastRadiusLevel] || "#94a3b8",
        }}
      >
        <div className="impact-blast-score">
          <span
            className="impact-blast-num"
            style={{ color: levelColors[impact.blastRadiusLevel] || "#64748b" }}
          >
            {impact.blastRadiusScore}
          </span>
          <span className="impact-blast-max">/100</span>
        </div>
        <div className="impact-blast-label">
          <span
            className="impact-blast-level"
            style={{ color: levelColors[impact.blastRadiusLevel] || "#64748b" }}
          >
            {impact.blastRadiusLevel}
          </span>
          <span className="impact-blast-conf">
            {impact.confidence} confidence
          </span>
        </div>
      </div>

      <p className="impact-summary">{impact.summary}</p>

      {/* Direct impacts */}
      {impact.directImpacts.length > 0 && (
        <div className="impact-group">
          <div className="impact-group-label">
            Directly affected
            <span className="impact-group-count">{impact.directImpacts.length}</span>
          </div>
          {impact.directImpacts.slice(0, 8).map((d) => (
            <ImpactRow key={d.systemId} entry={d} onSelect={onSelect} />
          ))}
        </div>
      )}

      {/* Indirect impacts */}
      {impact.indirectImpacts.length > 0 && (
        <div className="impact-group">
          <div className="impact-group-label">
            Indirectly affected
            <span className="impact-group-count">{impact.indirectImpacts.length}</span>
          </div>
          {impact.indirectImpacts.slice(0, 6).map((d) => (
            <ImpactRow key={d.systemId} entry={d} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactRow({
  entry,
  onSelect,
}: {
  entry: ImpactEntry;
  onSelect: (id: string) => void;
}) {
  const riskColors: Record<string, string> = {
    high: "#dc2626",
    medium: "#d97706",
    low: "#94a3b8",
  };
  const riskBg: Record<string, string> = {
    high: "#fef2f2",
    medium: "#fffbeb",
    low: "#f8fafc",
  };

  return (
    <div className="impact-row" onClick={() => onSelect(entry.systemId)}>
      <div className="impact-row-header">
        <span className="impact-row-name">{entry.systemName}</span>
        <span
          className="impact-risk-badge"
          style={{ color: riskColors[entry.risk], background: riskBg[entry.risk] }}
        >
          {entry.risk}
        </span>
        <span className="impact-type-badge">{entry.impactType}</span>
      </div>
      <div className="impact-row-reason">{entry.reason}</div>
      {entry.via && entry.via.length > 0 && (
        <div className="impact-row-via">via {entry.via.join(" → ")}</div>
      )}
    </div>
  );
}

function groupByRelation(
  conns: { relation: string; targetSystemId: string; targetSystemName: string; confidence: number }[]
): [string, typeof conns][] {
  const groups: Record<string, typeof conns> = {};
  for (const c of conns.slice(0, 6)) {
    const r = c.relation === "used-by" ? "uses" : c.relation;
    (groups[r] ??= []).push(c);
  }
  return Object.entries(groups);
}

export default function DetailPanel({ data, selectedId, onSelect }: DetailPanelProps) {
  const sys = selectedId ? data.analysis.systems.find((s) => s.id === selectedId) : null;
  if (!sys) return null;

  return <SystemDetailPanel sys={sys} data={data} onSelect={onSelect} />;
}
