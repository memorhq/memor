import React, { useState, useCallback } from "react";
import type {
  AppData,
  RepoStory,
  RepoZone,
  RepoFlowSummary,
  ReadingStepSummary,
  KeyCoupling,
  AhaSummary,
  DemoScript,
} from "./types";

type Props = {
  data: AppData;
  onNodeClick: (systemId: string) => void;
};

const SECTION_MICROCOPY: Record<string, string> = {
  start: "Begin here to understand the architecture from its entry surface.",
  flows: "These are the main ways work moves through the system.",
  couplings: "These connections are most likely to amplify change.",
  readingOrder: "Follow this path to build context without drowning in files.",
  zones: "Architectural zones group related systems by responsibility.",
  impact: "Use this before refactoring to estimate blast radius.",
};

export default function ArchitectureMap({ data, onNodeClick }: Props) {
  const story = data.repoStory;
  const systems = data.analysis.systems;
  const aha = data.ahaSummary;

  if (!story || story.zones.length === 0) {
    return (
      <div className="arch-map">
        <p className="arch-summary">
          {data.connectionGraph?.summary || "Analyzing repository structure..."}
        </p>
        <div className="arch-group">
          <div className="arch-group-label">all systems</div>
          <div className="arch-items">
            {systems.map((s) => (
              <div key={s.id} className="arch-item-card" onClick={() => onNodeClick(s.id)}>
                <div className="arch-item-name">{s.name}</div>
                {s.description && (
                  <div className="arch-item-sub">{s.description.slice(0, 60)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const sysMap = new Map(systems.map((s) => [s.id, s]));

  return (
    <div className="arch-map">
      {/* 1. Aha Summary */}
      {aha && <AhaSummaryPanel aha={aha} />}

      {/* 2. At-a-Glance */}
      {aha && <GlancePanel aha={aha} />}

      {/* 3. Quick-focus chips */}
      <QuickChips
        story={story}
        aha={aha}
        systems={systems}
        onNodeClick={onNodeClick}
      />

      {/* 4. Recommended Start */}
      {story.recommendedStart && (
        <section id="section-start">
          <SectionHeader title="Recommended start" microcopy={SECTION_MICROCOPY.start} />
          <div className="arch-start">
            <span className="arch-start-label">Start here</span>
            <code className="arch-start-path">{story.recommendedStart}</code>
            {story.startReason && (
              <span className="arch-start-reason">{story.startReason}</span>
            )}
          </div>
        </section>
      )}

      {/* 5. Likely Flows */}
      {story.flows && story.flows.length > 0 && (
        <section id="section-flows">
          <SectionHeader title="Likely flows" microcopy={SECTION_MICROCOPY.flows} />
          {story.flows.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </section>
      )}

      {/* 6. Key Couplings */}
      {story.keyCouplings && story.keyCouplings.length > 0 && (
        <section id="section-couplings">
          <SectionHeader title="Key couplings" microcopy={SECTION_MICROCOPY.couplings} />
          <CollapsibleList items={story.keyCouplings} initialCount={5} renderItem={(c, i) => (
            <CouplingCard key={i} coupling={c} />
          )} />
        </section>
      )}

      {/* 7. Reading Order */}
      {story.readingOrder && story.readingOrder.length > 0 && (
        <section id="section-reading-order">
          <SectionHeader title="Reading order" microcopy={SECTION_MICROCOPY.readingOrder} />
          <div className="arch-reading-list">
            {story.readingOrder.map((rs) => (
              <ReadingStepCard key={rs.step} step={rs} systems={systems} onNodeClick={onNodeClick} impactResults={data.impactResults} />
            ))}
          </div>
        </section>
      )}

      {/* 8. Zones + Systems */}
      <section id="section-zones">
        <SectionHeader title="Architecture zones" microcopy={SECTION_MICROCOPY.zones} />
        <CollapsibleList items={story.zones} initialCount={6} renderItem={(zone) => (
          <ZoneCard
            key={zone.name}
            zone={zone}
            sysMap={sysMap}
            onNodeClick={onNodeClick}
            impactResults={data.impactResults}
          />
        )} />
      </section>
    </div>
  );
}

// ── Section Header with microcopy ─────────────────────────────────────

function SectionHeader({ title, microcopy }: { title: string; microcopy?: string }) {
  return (
    <div className="arch-section-hd">
      <div className="arch-section-title">{title}</div>
      {microcopy && <div className="arch-section-micro">{microcopy}</div>}
    </div>
  );
}

// ── Aha Summary Panel ─────────────────────────────────────────────────

function AhaSummaryPanel({ aha }: { aha: AhaSummary }) {
  return (
    <div className="aha-panel" id="section-aha-summary">
      <h1 className="aha-headline">{aha.headline}</h1>
      <p className="aha-sub">{aha.subheadline}</p>

      {aha.bullets.length > 0 && (
        <ul className="aha-bullets">
          {aha.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {aha.warnings.length > 0 && (
        <div className="aha-warnings">
          {aha.warnings.map((w, i) => (
            <div key={i} className="aha-warning">{w}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── At-a-Glance Panel ─────────────────────────────────────────────────

function GlancePanel({ aha }: { aha: AhaSummary }) {
  const g = aha.glance;
  return (
    <div className="glance-panel">
      <div className="glance-title">At a glance</div>
      <div className="glance-grid">
        <GlanceStat label="Type" value={g.repoType} />
        <GlanceStat label="Systems" value={String(g.systems)} />
        <GlanceStat label="Zones" value={String(g.zones)} />
        <GlanceStat label="Flows" value={String(g.flows)} />
        <GlanceStat label="Strong couplings" value={String(g.strongCouplings)} />
        {g.highestRiskSystem && (
          <GlanceStat
            label="Highest risk"
            value={g.highestRiskSystem}
            sub={g.highestRiskLevel ? `${g.highestRiskScore}/100 · ${g.highestRiskLevel}` : undefined}
            warn={g.highestRiskLevel === "broad" || g.highestRiskLevel === "architectural"}
          />
        )}
      </div>
    </div>
  );
}

function GlanceStat({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className={`glance-stat${warn ? " glance-warn" : ""}`}>
      <div className="glance-stat-label">{label}</div>
      <div className="glance-stat-value">{value}</div>
      {sub && <div className="glance-stat-sub">{sub}</div>}
    </div>
  );
}

// ── Quick-focus Chips ─────────────────────────────────────────────────

function QuickChips({
  story,
  aha,
  systems,
  onNodeClick,
}: {
  story: RepoStory;
  aha?: AhaSummary;
  systems: AppData["analysis"]["systems"];
  onNodeClick: (id: string) => void;
}) {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const startSys = story.readingOrder?.[0]
    ? systems.find((s) => s.name === story.readingOrder[0].systemName)
    : null;
  const hasFlow = story.flows.length > 0;
  const hasCoupling = story.keyCouplings.length > 0;
  const riskSys = aha?.glance.highestRiskSystem
    ? systems.find((s) => s.name === aha.glance.highestRiskSystem)
    : null;

  return (
    <div className="quick-chips">
      {startSys && (
        <button className="quick-chip chip-start" onClick={() => onNodeClick(startSys.id)}>
          Start Here
        </button>
      )}
      {hasFlow && (
        <button className="quick-chip chip-flow" onClick={() => scrollTo("section-flows")}>
          Main Flow
        </button>
      )}
      {hasCoupling && (
        <button className="quick-chip chip-coupling" onClick={() => scrollTo("section-couplings")}>
          Tightest Coupling
        </button>
      )}
      {riskSys && (
        <button className="quick-chip chip-risk" onClick={() => onNodeClick(riskSys.id)}>
          Riskiest System
        </button>
      )}
    </div>
  );
}

// ── Collapsible List ──────────────────────────────────────────────────

function CollapsibleList<T>({
  items,
  initialCount,
  renderItem,
}: {
  items: T[];
  initialCount: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initialCount);
  const hasMore = items.length > initialCount;

  return (
    <>
      {visible.map((item, i) => renderItem(item, i))}
      {hasMore && (
        <button className="show-more-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : `Show ${items.length - initialCount} more`}
        </button>
      )}
    </>
  );
}

// ── Risk Badge ────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  if (level === "local") return null;
  return <span className={`risk-badge risk-${level}`}>{level}</span>;
}

// ── Zone Card ─────────────────────────────────────────────────────────

function ZoneCard({
  zone,
  sysMap,
  onNodeClick,
  impactResults,
}: {
  zone: RepoZone;
  sysMap: Map<string, AppData["analysis"]["systems"][0]>;
  onNodeClick: (id: string) => void;
  impactResults?: AppData["impactResults"];
}) {
  const seen = new Set<string>();
  const resolvedSystems: AppData["analysis"]["systems"] = [];
  for (const id of zone.systemIds) {
    const sys = sysMap.get(id);
    if (sys && !seen.has(sys.id)) {
      seen.add(sys.id);
      resolvedSystems.push(sys);
    }
  }

  const isSinglePackageZone = resolvedSystems.length === 1 && zone.systemNames.length === 1;
  const showExpanded = resolvedSystems.length > 1 && resolvedSystems.length <= 8;

  return (
    <div className="arch-group">
      <div className="arch-group-label">
        <span className="arch-zone-icon">{zoneIcon(zone.name)}</span>
        {zone.name}
        {!isSinglePackageZone && (
          <span className="arch-group-count">{zone.systemNames.length}</span>
        )}
      </div>
      <div className="arch-zone-desc">{zone.description}</div>

      {isSinglePackageZone ? null : showExpanded ? (
        <div className="arch-items">
          {resolvedSystems.map((sys) => {
            const impact = impactResults?.[sys.id];
            return (
              <div
                key={sys.id}
                className="arch-item-card"
                onClick={() => onNodeClick(sys.id)}
              >
                <div className="arch-item-header">
                  <div className="arch-item-name">{sys.name}</div>
                  {impact && impact.blastRadiusLevel !== "local" && (
                    <RiskBadge level={impact.blastRadiusLevel} />
                  )}
                </div>
                {sys.description && (
                  <div className="arch-item-sub">
                    {sys.description.length > 80
                      ? sys.description.slice(0, 77) + "..."
                      : sys.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="arch-compact-list">
          {zone.systemNames.map((name) => (
            <span key={name} className="arch-member">{name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reading Step Card ─────────────────────────────────────────────────

function ReadingStepCard({
  step,
  systems,
  onNodeClick,
  impactResults,
}: {
  step: ReadingStepSummary;
  systems: AppData["analysis"]["systems"];
  onNodeClick: (id: string) => void;
  impactResults?: AppData["impactResults"];
}) {
  const sys = systems.find((s) => s.name === step.systemName);
  const impact = sys ? impactResults?.[sys.id] : undefined;
  return (
    <div
      className="arch-reading-step"
      onClick={() => sys && onNodeClick(sys.id)}
      style={{ cursor: sys ? "pointer" : "default" }}
    >
      <span className="arch-reading-num">{step.step}</span>
      <div className="arch-reading-body">
        <div className="arch-reading-name-row">
          <span className="arch-reading-name">{step.systemName}</span>
          <span className="arch-reading-zone">{step.zoneName}</span>
          {impact && impact.blastRadiusLevel !== "local" && (
            <RiskBadge level={impact.blastRadiusLevel} />
          )}
        </div>
        <div className="arch-reading-reason">{step.reason}</div>
      </div>
    </div>
  );
}

// ── Coupling Card ─────────────────────────────────────────────────────

function CouplingCard({ coupling }: { coupling: KeyCoupling }) {
  return (
    <div className={`arch-coupling-card arch-coupling-${coupling.strength}`}>
      <div className="arch-coupling-header">
        <span className="arch-coupling-from">{coupling.from}</span>
        <span className="arch-coupling-arrow">↔</span>
        <span className="arch-coupling-to">{coupling.to}</span>
        <span className={`arch-coupling-badge arch-badge-${coupling.strength}`}>
          {coupling.strength}
        </span>
        <span className="arch-coupling-type-badge">{coupling.type}</span>
      </div>
      <div className="arch-coupling-reason">{coupling.reason}</div>
    </div>
  );
}

// ── Flow Card ─────────────────────────────────────────────────────────

function FlowCard({ flow }: { flow: RepoFlowSummary }) {
  return (
    <div className="arch-flow-card">
      <div className="arch-flow-title">
        <span className="arch-flow-type-badge">{flow.type}</span>
        {flow.title}
        <span className={`arch-flow-confidence arch-conf-${flow.confidence}`}>
          {flow.confidence}
        </span>
      </div>
      <div className="arch-flow-steps">
        {flow.steps.map((step, i) => (
          <div key={i} className="arch-flow-step">
            {i > 0 && <span className="arch-flow-arrow">→</span>}
            <div className="arch-flow-step-inner">
              <span className="arch-flow-step-label">{step.label}</span>
              <span className="arch-flow-step-desc">{step.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function zoneIcon(name: string): string {
  switch (name) {
    case "Core Runtime": return "◆";
    case "Renderers & Bindings": return "◇";
    case "Compiler": return "⚙";
    case "DevTools": return "🔧";
    case "Testing & Fixtures": return "✓";
    case "Integrations": return "⊕";
    case "Adapters & Deployment": return "▷";
    case "Content & Markdown": return "¶";
    case "Language Tools": return "◈";
    case "CLI & Scaffolding": return "▸";
    case "Build & Tooling": return "⚡";
    case "Examples & Playgrounds": return "△";
    case "Marketing / Public Surface": return "◎";
    case "Dashboard / Product Surface": return "◆";
    case "API / BFF Layer": return "⇄";
    case "Auth & Onboarding": return "◇";
    case "Shared Components": return "▣";
    case "Data / Lib Layer": return "▤";
    case "State / Providers": return "◉";
    default: return "●";
  }
}
