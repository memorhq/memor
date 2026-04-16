import type { MemorSystem, RepoAnalysis, RepoMode } from "../types";

// ── Zone classification rules ─────────────────────────────────────────

type ZoneRule = {
  zone: string;
  match: (name: string, sys: MemorSystem) => boolean;
};

const ZONE_RULES: ZoneRule[] = [
  // ── App-specific zones (take priority for product-web-app repos) ────
  {
    zone: "API / BFF Layer",
    match: (n, s) =>
      /api.*route|api.*handler|bff.*proxy|api.*layer/i.test(n) ||
      (s.type === "api-service" && /\bapi\b/i.test(s.rootPath)),
  },
  {
    zone: "Dashboard / Product Surface",
    match: (n) =>
      /dashboard|admin|workspace|account|settings/i.test(n) &&
      /surface|feature/i.test(n),
  },
  {
    zone: "Marketing / Public Surface",
    match: (n) =>
      (/marketing|landing|home|pricing|blog|legal|terms|privacy|docs/i.test(n) &&
       /surface|feature|pages?/i.test(n)) ||
      /^landing/i.test(n) ||
      /^legal\b/i.test(n) ||
      /^docs\b/i.test(n),
  },
  {
    zone: "Auth & Onboarding",
    match: (n) =>
      /auth|onboarding|login|signin|signup/i.test(n),
  },
  {
    zone: "Shared Components",
    match: (n, s) =>
      /shared.*component|ui.*component|component.*library/i.test(n) ||
      (s.type === "ui-library" && /component/i.test(s.rootPath)),
  },
  {
    zone: "Data / Lib Layer",
    match: (n, s) =>
      (/data.*layer|lib.*layer|custom.*hook/i.test(n) ||
       /services.*layer/i.test(n)) &&
      s.type === "shared-package",
  },
  {
    zone: "State / Providers",
    match: (n, s) =>
      /state.*provider|provider|context|store/i.test(n) &&
      s.type === "shared-package",
  },
  // ── Framework/library zones ─────────────────────────────────────────
  {
    zone: "DevTools",
    match: (n) => /devtools|debug-tools/i.test(n),
  },
  {
    zone: "Testing & Fixtures",
    match: (n, s) =>
      /test|jest|vitest|fixture|spec|mock/i.test(n) ||
      s.inferredSupportRole === "test-harness" ||
      (s.type === "support-system" && /fixture|test/i.test(s.rootPath)),
  },
  {
    zone: "Compiler",
    match: (n, s) =>
      /compiler|babel|transform|codegen/i.test(n) ||
      (s.type === "support-system" && /compiler/i.test(s.rootPath)),
  },
  {
    zone: "Core Runtime",
    match: (n) =>
      /\b(core|runtime|scheduler|reconciler|shared|common)\b/i.test(n) ||
      /^(core|runtime|scheduler|reconciler|shared|common)$/i.test(n),
  },
  {
    zone: "Renderers & Bindings",
    match: (n) =>
      /(dom|renderer|native|client|server-dom|bindings)/i.test(n) &&
      !/devtools/i.test(n) &&
      !/test/i.test(n),
  },
  {
    zone: "Adapters & Deployment",
    match: (n) =>
      /adapter|^node$|platform-|cloudflare|vercel|netlify|deno|deploy/i.test(n),
  },
  {
    zone: "Integrations",
    match: (n, s) =>
      /integration/i.test(s.rootPath) ||
      ((s.connections?.outgoing?.some((c) => c.relation === "extends") ?? false) &&
       s.systemTier === "support"),
  },
  {
    zone: "Content & Markdown",
    match: (n, s) =>
      /markdown|remark|mdx|markdoc|prism|content/i.test(n) ||
      /markdown/i.test(s.rootPath),
  },
  {
    zone: "Language Tools",
    match: (n, s) =>
      /language|lsp|vscode|ts-plugin|check/i.test(n) ||
      /language/i.test(s.rootPath),
  },
  {
    zone: "CLI & Scaffolding",
    match: (n) => /^create-|^cli$|scaffold/i.test(n),
  },
  {
    zone: "Build & Tooling",
    match: (n, s) =>
      /scripts|rollup|eslint|lint|config|tooling/i.test(n) ||
      (s.type === "support-system" && /scripts|benchmark/i.test(s.rootPath)),
  },
  {
    zone: "Examples & Playgrounds",
    match: (n, s) =>
      /example|playground|sandbox|demo|starter/i.test(n) ||
      (s.type === "support-system" && /example|playground/i.test(s.rootPath)),
  },
];

// ── Zone description templates ────────────────────────────────────────

function describeZone(
  zoneName: string,
  members: MemorSystem[],
  centerName: string
): string {
  const count = members.length;
  const names = members
    .slice(0, 4)
    .map((m) => m.name)
    .join(", ");

  switch (zoneName) {
    case "API / BFF Layer":
      return `Server-side route handlers that proxy browser actions to external or upstream APIs.`;
    case "Dashboard / Product Surface":
      return `Authenticated product interface where core user workflows are executed (${names}).`;
    case "Marketing / Public Surface":
      return `Public-facing route surfaces for acquisition, education, and entry into the product.`;
    case "Auth & Onboarding":
      return `Authentication, sign-up, and onboarding flows managing user access.`;
    case "Shared Components":
      return `Reusable UI building blocks used across public and product surfaces.`;
    case "Data / Lib Layer":
      return `Application helpers, data access utilities, and feature logic supporting route behavior.`;
    case "State / Providers":
      return `Application state management, context providers, and global data stores.`;
    case "Core Runtime":
      return `Foundational runtime packages (${names}). The architectural center of the framework.`;
    case "Renderers & Bindings":
      return `Environment-specific renderers and host bindings (${names}). Bridge ${centerName} core to concrete platforms.`;
    case "Compiler":
      return `Build-time compilation and code transformation. Transforms source into optimized output.`;
    case "DevTools":
      return `Developer tooling for debugging, profiling, and inspection (${count} packages).`;
    case "Testing & Fixtures":
      return `Test utilities, matchers, and fixture infrastructure (${count} packages).`;
    case "Integrations":
      return `Official extensions that add framework/library support to ${centerName} (${count} packages).`;
    case "Adapters & Deployment":
      return `Deployment adapters for specific platforms and runtimes (${names}).`;
    case "Content & Markdown":
      return `Content processing pipeline for Markdown, MDX, and related formats.`;
    case "Language Tools":
      return `Editor support, language server, and type-checking infrastructure.`;
    case "CLI & Scaffolding":
      return `Command-line tools for project creation and management.`;
    case "Build & Tooling":
      return `Build scripts, bundling configuration, and repo-level infrastructure.`;
    case "Examples & Playgrounds":
      return `Example projects and development playgrounds for testing and validation.`;
    default:
      return `${count} package${count !== 1 ? "s" : ""}: ${names}.`;
  }
}

// ── Single-package framework story ────────────────────────────────────

function buildSinglePackageStory(
  analysis: RepoAnalysis,
  center: MemorSystem,
  systems: MemorSystem[]
): RepoStory {
  const internal = center.internalStructure!;
  const zones: RepoZone[] = internal.zones.map((iz) => ({
    name: iz.label,
    systemIds: [center.id],
    systemNames: [iz.label],
    description: describeInternalZone(iz.label, center.name),
  }));

  // Add non-package support systems as additional zones
  for (const sys of systems) {
    if (sys.id === center.id) continue;
    zones.push({
      name: sys.name,
      systemIds: [sys.id],
      systemNames: [sys.name],
      description: sys.description || `Support directory: ${sys.name}`,
    });
  }

  return {
    repoType: refineRepoType(analysis.repoMode, systems),
    primaryCenter: center.name,
    zones,
    flows: [],
    readingOrder: [],
    keyCouplings: [],
    recommendedStart: center.recommendedStartPath ?? center.rootPath,
    startReason: center.startPathReason ?? `Main entry point for ${center.name}.`,
  };
}

function describeInternalZone(zoneName: string, centerName: string): string {
  const lower = zoneName.toLowerCase();
  if (/compiler/i.test(lower))
    return `Build-time compiler that transforms ${centerName} components into executable code.`;
  if (/internal|runtime/i.test(lower))
    return `Internal runtime implementation — DOM reconciliation, reactivity, and lifecycle management.`;
  if (/server/i.test(lower))
    return `Server-side rendering support for ${centerName} components.`;
  if (/store|reactivity/i.test(lower))
    return `Reactive state management primitives.`;
  if (/action|event/i.test(lower))
    return `Action handlers and event binding utilities.`;
  if (/transition|animate|motion/i.test(lower))
    return `Animation and transition system for UI elements.`;
  if (/legacy/i.test(lower))
    return `Backward compatibility layer for older APIs.`;
  if (/types?/i.test(lower))
    return `Type definitions and public API surface.`;
  return `${zoneName} subsystem of ${centerName}.`;
}

// ── Repo type refinement ──────────────────────────────────────────────

function refineRepoType(
  repoMode: RepoMode,
  systems: MemorSystem[]
): string {
  const packageCount = systems.filter(
    (s) => s.type !== "support-system"
  ).length;

  if (repoMode === "framework-core") {
    if (packageCount <= 1) return "Framework (single package)";
    return "Framework core (monorepo)";
  }
  if (repoMode === "surface-platform") return "Multi-surface platform";
  if (repoMode === "product-domain-machine") return "Product monorepo";
  if (repoMode === "library-tooling") {
    if (packageCount <= 1) return "Library";
    return "Library ecosystem";
  }
  if (repoMode === "workflow-platform") return "Workflow platform";
  if (repoMode === "product-web-app") {
    const hasApi = systems.some(
      (s) => s.type === "api-service" || /api/i.test(s.name)
    );
    return hasApi ? "Product web app with BFF" : "Product web app";
  }
  if (repoMode === "unknown") {
    if (packageCount <= 1) return "Single-package repo";
    return "Monorepo";
  }
  return repoMode;
}

// ── Main story generator ──────────────────────────────────────────────

export type RepoZone = {
  name: string;
  systemIds: string[];
  systemNames: string[];
  description: string;
};

export type RepoFlowSummary = {
  id: string;
  title: string;
  type: string;
  confidence: string;
  isMain?: boolean;
  derivedFrom?: string;
  structuralReason?: string;
  steps: {
    label: string;
    description: string;
    systemName?: string;
    zoneName?: string;
    evidenceFile?: string;
    evidenceLine?: number;
    handlerName?: string;
  }[];
};

export type ReadingStepSummary = {
  step: number;
  systemName: string;
  zoneName: string;
  reason: string;
};

export type KeyCoupling = {
  from: string;
  to: string;
  type: string;
  strength: string;
  reason: string;
};

export type RepoStory = {
  repoType: string;
  primaryCenter: string | null;
  zones: RepoZone[];
  flows: RepoFlowSummary[];
  readingOrder: ReadingStepSummary[];
  keyCouplings: KeyCoupling[];
  recommendedStart: string;
  startReason: string;
};

export function generateRepoStory(analysis: RepoAnalysis): RepoStory {
  const { systems, repoMode, repoName } = analysis;
  // Pick THE single center: prefer the system whose name best matches the repo name
  const centers = systems.filter((s) => s.isRepoCenter);
  const center = centers.length <= 1
    ? centers[0]
    : centers.find(
        (s) =>
          s.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          repoName.toLowerCase().replace(/[^a-z0-9]/g, "")
      ) ?? centers[0];
  const centerName = center?.name ?? repoName;

  // Single-package framework: derive zones from center's internal structure
  if (
    center &&
    center.internalStructure &&
    center.internalStructure.zones.length >= 3 &&
    systems.filter((s) => s.type !== "support-system").length <= 2
  ) {
    return buildSinglePackageStory(analysis, center, systems);
  }

  // Assign each system to exactly one zone
  const zoneMap = new Map<string, MemorSystem[]>();
  const assigned = new Set<string>();

  for (const sys of systems) {
    const n = sys.name.toLowerCase();
    let matched = false;

    // Skip THE center from zone assignment — it's shown separately
    if (sys.id === center?.id) continue;

    for (const rule of ZONE_RULES) {
      if (rule.match(n, sys)) {
        const arr = zoneMap.get(rule.zone) || [];
        arr.push(sys);
        zoneMap.set(rule.zone, arr);
        assigned.add(sys.id);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Fallback: group by tier (app repos get app-friendly fallbacks)
      const isAppMode = repoMode === "product-web-app";
      const fallbackZone =
        sys.systemTier === "primary"
          ? isAppMode ? "Dashboard / Product Surface" : "Core Runtime"
          : sys.systemTier === "secondary"
          ? isAppMode ? "Shared Components" : "Key Packages"
          : "Support Packages";
      const arr = zoneMap.get(fallbackZone) || [];
      arr.push(sys);
      zoneMap.set(fallbackZone, arr);
    }
  }

  // Build zone list, sorted by architectural importance
  const ZONE_ORDER = [
    // App-specific zones
    "Marketing / Public Surface",
    "Auth & Onboarding",
    "Dashboard / Product Surface",
    "API / BFF Layer",
    "Shared Components",
    "Data / Lib Layer",
    "State / Providers",
    // Framework/library zones
    "Core Runtime",
    "Renderers & Bindings",
    "Compiler",
    "Integrations",
    "Adapters & Deployment",
    "Content & Markdown",
    "Language Tools",
    "CLI & Scaffolding",
    "DevTools",
    "Key Packages",
    "Testing & Fixtures",
    "Build & Tooling",
    "Examples & Playgrounds",
    "Support Packages",
  ];

  const zones: RepoZone[] = [];
  for (const zoneName of ZONE_ORDER) {
    const members = zoneMap.get(zoneName);
    if (!members || members.length === 0) continue;
    zones.push({
      name: zoneName,
      systemIds: members.map((m) => m.id),
      systemNames: members.map((m) => m.name),
      description: describeZone(zoneName, members, centerName),
    });
  }

  // Any remaining zones not in ZONE_ORDER
  for (const [zoneName, members] of zoneMap) {
    if (ZONE_ORDER.includes(zoneName)) continue;
    zones.push({
      name: zoneName,
      systemIds: members.map((m) => m.id),
      systemNames: members.map((m) => m.name),
      description: describeZone(zoneName, members, centerName),
    });
  }

  // Recommended start
  let recommendedStart = center?.recommendedStartPath ?? "";
  let startReason = center?.startPathReason ?? "";
  if (!recommendedStart && systems.length > 0) {
    const best = systems.find((s) => s.systemTier === "primary") ?? systems[0];
    recommendedStart = best.recommendedStartPath ?? best.rootPath;
    startReason = `Primary entry point for ${best.name}.`;
  }

  return {
    repoType: refineRepoType(repoMode, systems),
    primaryCenter: center?.name ?? null,
    zones,
    flows: [],
    readingOrder: [],
    keyCouplings: [],
    recommendedStart,
    startReason,
  };
}
