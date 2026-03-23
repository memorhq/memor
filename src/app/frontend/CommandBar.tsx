import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { AppData } from "./types";

type Suggestion = {
  type: "command" | "system" | "zone" | "flow";
  label: string;
  sublabel?: string;
  action: () => void;
};

const BUILTIN_COMMANDS = [
  { label: "Start here", sublabel: "Jump to recommended entry", actionType: "start-here" },
  { label: "Show main flow", sublabel: "Activate flow tracing mode", actionType: "main-flow" },
  { label: "Show riskiest system", sublabel: "Focus highest blast radius", actionType: "riskiest" },
  { label: "Show strongest coupling", sublabel: "Navigate to tightest link", actionType: "strongest-coupling" },
  { label: "Back to zones", sublabel: "Return to zone overview", actionType: "go-home" },
  { label: "Structure mode", sublabel: "Switch to structure view", actionType: "mode-structure" },
  { label: "Flow mode", sublabel: "Switch to flow tracing", actionType: "mode-flow" },
  { label: "Impact mode", sublabel: "Switch to impact overlay", actionType: "mode-impact" },
] as const;

function dispatchCanvasAction(action: any) {
  const fn = (window as any).__canvasAction;
  if (typeof fn === "function") fn(action);
}

export default function CommandBar({
  isOpen,
  onClose,
  data,
}: {
  isOpen: boolean;
  onClose: () => void;
  data: AppData;
}) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const suggestions = useMemo((): Suggestion[] => {
    const q = query.toLowerCase().trim();
    const results: Suggestion[] = [];

    // commands
    for (const cmd of BUILTIN_COMMANDS) {
      if (!q || cmd.label.toLowerCase().includes(q)) {
        results.push({
          type: "command",
          label: cmd.label,
          sublabel: cmd.sublabel,
          action: () => {
            switch (cmd.actionType) {
              case "start-here":
                dispatchCanvasAction({ type: "start-here" });
                break;
              case "main-flow":
                dispatchCanvasAction({ type: "set-mode", mode: "flow" });
                break;
              case "riskiest":
                dispatchCanvasAction({ type: "riskiest" });
                break;
              case "strongest-coupling":
                dispatchCanvasAction({ type: "strongest-coupling" });
                break;
              case "go-home":
                dispatchCanvasAction({ type: "go-home" });
                break;
              case "mode-structure":
                dispatchCanvasAction({ type: "set-mode", mode: "structure" });
                break;
              case "mode-flow":
                dispatchCanvasAction({ type: "set-mode", mode: "flow" });
                break;
              case "mode-impact":
                dispatchCanvasAction({ type: "set-mode", mode: "impact" });
                break;
            }
          },
        });
      }
    }

    // zones
    if (data.repoStory) {
      for (const z of data.repoStory.zones) {
        if (!q || z.name.toLowerCase().includes(q)) {
          results.push({
            type: "zone",
            label: z.name,
            sublabel: `Zone · ${z.systemNames.length} systems`,
            action: () => dispatchCanvasAction({ type: "go-zone", name: z.name }),
          });
        }
      }
    }

    // systems
    for (const sys of data.analysis.systems) {
      if (!q || sys.name.toLowerCase().includes(q)) {
        results.push({
          type: "system",
          label: sys.name,
          sublabel: `System · ${sys.type?.replace(/-/g, " ")}`,
          action: () => dispatchCanvasAction({ type: "go-system", id: sys.id }),
        });
      }
    }

    // flows
    if (data.repoStory) {
      for (const f of data.repoStory.flows) {
        if (!q || f.title.toLowerCase().includes(q)) {
          results.push({
            type: "flow",
            label: f.title,
            sublabel: "Flow",
            action: () => dispatchCanvasAction({ type: "set-flow", flowId: f.id }),
          });
        }
      }
    }

    // "what breaks if I change X" pattern
    if (q.startsWith("what breaks") || q.startsWith("impact of")) {
      const rest = q.replace(/^(what breaks if i change|what breaks|impact of)\s*/i, "");
      for (const sys of data.analysis.systems) {
        if (!rest || sys.name.toLowerCase().includes(rest)) {
          results.push({
            type: "command",
            label: `Impact of changing ${sys.name}`,
            sublabel: "Show blast radius",
            action: () => dispatchCanvasAction({ type: "set-impact-target", systemId: sys.id }),
          });
        }
      }
    }

    return results.slice(0, 12);
  }, [query, data]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestions[selectedIdx]) {
          suggestions[selectedIdx].action();
          onClose();
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [suggestions, selectedIdx, onClose],
  );

  if (!isOpen) return null;

  const typeIcons: Record<string, string> = {
    command: "▸",
    zone: "◇",
    system: "●",
    flow: "→",
  };

  return (
    <>
      <div className="cmd-backdrop" onClick={onClose} />
      <div className="cmd-bar">
        <div className="cmd-input-row">
          <span className="cmd-slash">/</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Search systems, zones, or type a command…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {suggestions.length > 0 && (
          <div className="cmd-suggestions">
            {suggestions.map((s, i) => (
              <div
                key={`${s.type}-${s.label}-${i}`}
                className={`cmd-item${i === selectedIdx ? " cmd-item-active" : ""}`}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => {
                  s.action();
                  onClose();
                }}
              >
                <span className="cmd-item-icon">{typeIcons[s.type] || "●"}</span>
                <div className="cmd-item-text">
                  <span className="cmd-item-label">{s.label}</span>
                  {s.sublabel && (
                    <span className="cmd-item-sub">{s.sublabel}</span>
                  )}
                </div>
                <span className="cmd-item-type">{s.type}</span>
              </div>
            ))}
          </div>
        )}
        <div className="cmd-footer">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  );
}
