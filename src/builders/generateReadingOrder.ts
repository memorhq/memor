import type { MemorSystem, RepoAnalysis } from "../types";
import type { RepoStory, RepoZone } from "./generateRepoStory";

export type ReadingStep = {
  step: number;
  systemName: string;
  zoneName: string;
  reason: string;
};

export type ReadingOrder = {
  steps: ReadingStep[];
};

// Zone priority for reading order: architectural importance, top → bottom
const ZONE_READING_PRIORITY: Record<string, number> = {
  // App-specific zones
  "Marketing / Public Surface": 0,
  "Auth & Onboarding": 1,
  "Dashboard / Product Surface": 2,
  "API / BFF Layer": 3,
  "Shared Components": 4,
  "Data / Lib Layer": 5,
  "State / Providers": 6,
  // Framework/library zones
  "CLI & Scaffolding": 7,
  "Core Runtime": 8,
  "Renderers & Bindings": 9,
  "Compiler": 10,
  "Content & Markdown": 11,
  "Integrations": 12,
  "Adapters & Deployment": 13,
  "Language Tools": 14,
  "DevTools": 15,
  "Key Packages": 16,
  "Testing & Fixtures": 17,
  "Build & Tooling": 18,
  "Examples & Playgrounds": 19,
  "Support Packages": 20,
};

export function generateReadingOrder(
  analysis: RepoAnalysis,
  story: RepoStory
): ReadingOrder {
  const { systems } = analysis;
  const sysMap = new Map(systems.map((s) => [s.name, s]));
  const sysIdMap = new Map(systems.map((s) => [s.id, s]));

  // Build zone lookup: systemId → zoneName
  const zoneOf = new Map<string, string>();
  for (const zone of story.zones) {
    for (const id of zone.systemIds) {
      zoneOf.set(id, zone.name);
    }
  }
  // Center system belongs to its own "entry" zone conceptually
  const center = systems.find(
    (s) =>
      s.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
      (story.primaryCenter || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  );
  if (center) zoneOf.set(center.id, "Entry");

  // Single-package framework: use internal zones only when there are very few
  // external systems (≤ 2 non-support packages), matching the story generator logic
  const nonSupportCount = systems.filter((s) => s.type !== "support-system").length;
  if (
    center?.internalStructure &&
    center.internalStructure.zones.length >= 3 &&
    nonSupportCount <= 2
  ) {
    return buildSinglePackageReadingOrder(center, story);
  }

  const ordered: ReadingStep[] = [];
  const visited = new Set<string>();
  let step = 1;

  function addStep(sys: MemorSystem, reason: string): void {
    if (visited.has(sys.id)) return;
    visited.add(sys.id);
    ordered.push({
      step: step++,
      systemName: sys.name,
      zoneName: zoneOf.get(sys.id) || "Other",
      reason,
    });
  }

  // 1. Start with the entry point / public API
  if (center) {
    addStep(center, "Start here: this is the public API surface that consumers import.");
  }

  // 2. CLI / scaffolding (if exists) — this is how new users first interact
  const cli = systems.find(
    (s) => /^create-/i.test(s.name) || (s.name === "cli" && s.systemTier !== "support")
  );
  if (cli) {
    addStep(cli, "The onboarding entry point — new users start here to scaffold projects.");
  }

  // 3. Direct dependencies of the center (sorted by importance)
  if (center?.connections?.outgoing) {
    const directDeps = center.connections.outgoing
      .filter((c) => c.relation === "uses" || c.relation === "extends")
      .map((c) => sysIdMap.get(c.targetSystemId))
      .filter((s): s is MemorSystem => !!s)
      .sort((a, b) => b.importanceScore - a.importanceScore);

    for (const dep of directDeps.slice(0, 3)) {
      addStep(
        dep,
        `Directly used by ${center.name} — ${inferConnectionRole(dep, center)}.`
      );
    }
  }

  // 4. Core runtime systems not yet visited
  const coreZone = story.zones.find((z) => z.name === "Core Runtime");
  if (coreZone) {
    const coreSystems = coreZone.systemIds
      .map((id) => sysIdMap.get(id))
      .filter((s): s is MemorSystem => !!s && !visited.has(s.id))
      .sort((a, b) => b.importanceScore - a.importanceScore);

    for (const sys of coreSystems.slice(0, 2)) {
      addStep(sys, `Core runtime layer — ${describeRuntimeRole(sys)}.`);
    }
  }

  // 5. Renderers / environment bindings
  const rendererZone = story.zones.find((z) => z.name === "Renderers & Bindings");
  if (rendererZone) {
    const renderers = rendererZone.systemIds
      .map((id) => sysIdMap.get(id))
      .filter((s): s is MemorSystem => !!s && !visited.has(s.id))
      .sort((a, b) => b.importanceScore - a.importanceScore);

    if (renderers.length > 0) {
      addStep(renderers[0], `Primary renderer — translates core output to a concrete platform.`);
    }
  }

  // 6. Compiler (if present)
  const compilerZone = story.zones.find((z) => z.name === "Compiler");
  if (compilerZone) {
    const compiler = compilerZone.systemIds
      .map((id) => sysIdMap.get(id))
      .filter((s): s is MemorSystem => !!s && !visited.has(s.id));

    if (compiler.length > 0) {
      addStep(compiler[0], "Compiler — transforms source into optimized output consumed by the runtime.");
    }
  }

  // 7. Fill remaining important zones by priority order
  const remainingZones = story.zones
    .filter((z) => !["Core Runtime", "Renderers & Bindings", "Compiler"].includes(z.name))
    .sort((a, b) => (ZONE_READING_PRIORITY[a.name] ?? 99) - (ZONE_READING_PRIORITY[b.name] ?? 99));

  for (const zone of remainingZones) {
    if (step > 10) break;
    const representative = zone.systemIds
      .map((id) => sysIdMap.get(id))
      .filter((s): s is MemorSystem => !!s && !visited.has(s.id))
      .sort((a, b) => b.importanceScore - a.importanceScore)[0];

    if (representative) {
      addStep(representative, describeZoneReading(zone, representative));
    }
  }

  return { steps: ordered.slice(0, 12) };
}

// ── Single-package framework reading order ───────────────────────────

function buildSinglePackageReadingOrder(
  center: MemorSystem,
  story: RepoStory
): ReadingOrder {
  const zones = center.internalStructure!.zones;
  const steps: ReadingStep[] = [];
  let step = 1;

  const sorted = [...zones].sort((a, b) => {
    const ap = internalZonePriority(a.label, a.kind);
    const bp = internalZonePriority(b.label, b.kind);
    if (ap !== bp) return ap - bp;
    return b.importance - a.importance;
  });

  for (const iz of sorted.slice(0, 10)) {
    const matchingZone = story.zones.find((z) => z.name === iz.label);
    steps.push({
      step: step++,
      systemName: iz.label,
      zoneName: matchingZone?.name || iz.label,
      reason: describeInternalReadingStep(iz.label, iz.kind, center.name, step - 1),
    });
  }

  return { steps };
}

function internalZonePriority(label: string, kind: string): number {
  const lower = label.toLowerCase();
  // Name-based priority (more reliable than kind for single-package frameworks)
  if (/entry|main/i.test(lower)) return 0;
  if (/compiler/i.test(lower)) return 1;
  if (/runtime|internal/i.test(lower)) return 2;
  if (/reactivity|reactive|signal/i.test(lower)) return 3;
  if (/store/i.test(lower)) return 4;
  if (/server/i.test(lower)) return 5;
  if (/action|event/i.test(lower)) return 6;
  if (/transition|motion|animate/i.test(lower)) return 7;
  if (/types?$/i.test(lower)) return 8;
  if (/legacy/i.test(lower)) return 9;

  // Fallback by kind
  const kindMap: Record<string, number> = {
    entry: 0, api: 1, logic: 3, state: 4, provider: 5,
    route: 6, ui: 7, feature_area: 8, config: 9, support: 10,
  };
  return kindMap[kind] ?? 6;
}

function describeInternalReadingStep(
  label: string,
  kind: string,
  centerName: string,
  stepNum: number
): string {
  const lower = label.toLowerCase();

  // Name-specific reasons (more useful than kind-based)
  if (/compiler/i.test(lower))
    return `The ${centerName} compiler — transforms component source into executable JavaScript.`;
  if (/runtime|internal/i.test(lower))
    return `Internal runtime — DOM reconciliation, reactivity, and lifecycle management.`;
  if (/reactivity|reactive|signal/i.test(lower))
    return `Reactivity primitives — the reactive state system that powers updates.`;
  if (/store/i.test(lower))
    return `Store system — observable state management for components.`;
  if (/server/i.test(lower))
    return `Server-side rendering layer for ${centerName} components.`;
  if (/transition|motion|animate/i.test(lower))
    return `Animation and transition system for smooth UI updates.`;
  if (/action|event/i.test(lower))
    return `Action and event handling — how user interactions flow through ${centerName}.`;
  if (/legacy/i.test(lower))
    return `Backward compatibility layer for older APIs.`;
  if (/types?$/i.test(lower))
    return `Type definitions and public API surface.`;
  if (/entry|main/i.test(lower))
    return stepNum === 1
      ? `Start here: the main entry point consumers import as "${centerName}".`
      : `Entry point for ${centerName}.`;

  // Fallback by kind
  switch (kind) {
    case "entry": return `Start here: this is the main entry point for ${centerName}.`;
    case "api": return `Public API surface — what consumers import from ${centerName}.`;
    case "state": return `Reactive state primitives and store management.`;
    case "provider": return `Context and dependency injection layer.`;
    case "config": return `Configuration and build setup.`;
    case "support": return `Supporting utilities and internal infrastructure.`;
    default: return `${label} — internal subsystem of ${centerName}.`;
  }
}

// ── Helper: describe why a dependency matters ────────────────────────

function inferConnectionRole(dep: MemorSystem, center: MemorSystem): string {
  const n = dep.name.toLowerCase();
  if (/scheduler/i.test(n)) return "manages execution scheduling and prioritization";
  if (/reconciler/i.test(n)) return "handles the core diffing and update algorithm";
  if (/dom/i.test(n)) return "bridges the framework to browser DOM";
  if (/server/i.test(n)) return "provides server-side rendering capabilities";
  if (/client/i.test(n)) return "handles client-side streaming and hydration";
  if (/shared|common/i.test(n)) return "shared internal utilities";
  return `provides functionality consumed by ${center.name}`;
}

function describeRuntimeRole(sys: MemorSystem): string {
  const n = sys.name.toLowerCase();
  if (/reconciler/i.test(n)) return "handles tree diffing and commit phases";
  if (/scheduler/i.test(n)) return "prioritizes and batches work units";
  if (/shared/i.test(n)) return "shared constants and utility functions";
  return sys.description?.slice(0, 60) || "core infrastructure";
}

function describeZoneReading(zone: RepoZone, sys: MemorSystem): string {
  switch (zone.name) {
    case "Integrations":
      return `Integrations — official extensions (${zone.systemNames.length} packages). Start with ${sys.name}.`;
    case "Adapters & Deployment":
      return `Deployment adapters for different platforms. ${sys.name} is the most common.`;
    case "Content & Markdown":
      return "Content pipeline — how structured content is processed and rendered.";
    case "Language Tools":
      return "Editor tooling — language server and IDE integration.";
    case "CLI & Scaffolding":
      return "CLI entry point — how new projects are created.";
    case "DevTools":
      return "DevTools — debugging and inspection infrastructure.";
    case "Testing & Fixtures":
      return "Testing infrastructure — read last, useful for contributors.";
    case "Build & Tooling":
      return "Build infrastructure — scripts, configs, and repo tooling. Read last.";
    case "Examples & Playgrounds":
      return "Examples and playgrounds — useful for seeing patterns in action.";
    default:
      return `${zone.name} — ${zone.description.slice(0, 60)}.`;
  }
}
