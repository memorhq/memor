import React, { useState, useMemo } from "react";
import type { MemorSystem } from "./types";

type SidebarProps = {
  repoName: string;
  systems: MemorSystem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOverview: () => void;
};

const DOT_COLORS: Record<string, string> = {
  primary: "#3b82f6",
  secondary: "#64748b",
  support: "#94a3b8",
};

const TIER_LABELS: Record<string, string> = {
  primary: "Primary",
  secondary: "Secondary",
  support: "Support",
};

export default function Sidebar({ systems, selectedId, onSelect, onOverview }: SidebarProps) {
  const [filter, setFilter] = useState("");

  const grouped = useMemo(() => {
    const tiers = ["primary", "secondary", "support"] as const;
    const q = filter.toLowerCase();
    return tiers
      .map((tier) => ({
        tier,
        label: TIER_LABELS[tier],
        items: systems.filter(
          (s) => s.systemTier === tier && (!q || s.name.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [systems, filter]);

  return (
    <nav className="sidebar">
      {systems.length > 5 && (
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Filter\u2026"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      <div
        className="sidebar-item sidebar-overview-item"
        onClick={onOverview}
        style={{ opacity: selectedId ? 0.6 : 1 }}
      >
        <span className="sidebar-dot" style={{ background: "#3b82f6" }} />
        <span className="sidebar-name" style={{ fontWeight: 600 }}>All systems</span>
      </div>
      {grouped.map((g) => (
        <div className="sidebar-group" key={g.tier}>
          <div className="sidebar-header">
            {g.label} ({g.items.length})
          </div>
          {g.items.map((s) => (
            <div
              key={s.id}
              className={`sidebar-item${s.id === selectedId ? " active" : ""}`}
              onClick={() => onSelect(s.id)}
            >
              <span className="sidebar-dot" style={{ background: DOT_COLORS[s.systemTier] }} />
              <span className="sidebar-name">{s.name}</span>
              {s.isRepoCenter && <span className="sidebar-center">{"\u2605"}</span>}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}
