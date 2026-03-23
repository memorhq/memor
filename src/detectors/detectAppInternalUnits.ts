import * as path from "path";
import type { MemorSystem, SystemType, FlatScanEntry } from "../types";
import { slugify } from "../utils/text";

/**
 * For single-app web repos (product-web-app mode), decompose the app's
 * internal directories into pseudo-systems that represent architectural
 * units: route surfaces, shared UI, API/BFF layer, data/lib layer, etc.
 *
 * These pseudo-systems are injected into the main systems array so that
 * all downstream analysis (zones, flows, couplings, impact) works.
 */

export type AppUnit = {
  name: string;
  unitType: AppUnitType;
  description: string;
  rootPath: string;
  fileCount: number;
  routeFiles: string[];
};

export type AppUnitType =
  | "route-surface"
  | "api-layer"
  | "shared-ui"
  | "data-layer"
  | "state-layer"
  | "integration-layer"
  | "support-layer";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "out",
  ".cache", ".vercel", "coverage", "__pycache__", ".svelte-kit", ".nuxt",
]);

export function detectAppInternalUnits(
  mainSystem: MemorSystem,
  repoRoot: string,
  flat: FlatScanEntry[]
): MemorSystem[] {
  const appRoot = findAppRoot(repoRoot, flat);
  if (!appRoot) return [];

  const units: AppUnit[] = [];
  const appRelative = path.relative(repoRoot, appRoot);

  // ── Detect route surfaces from app directory ──────────────────────

  const routeGroups = detectRouteSurfaces(appRoot, appRelative, flat);
  units.push(...routeGroups);

  // ── Detect API/BFF layer ──────────────────────────────────────────

  const apiUnit = detectApiLayer(appRoot, appRelative, flat);
  if (apiUnit) units.push(apiUnit);

  // ── Detect shared layers (components, lib, hooks, etc.) ───────────

  const sharedLayers = detectSharedLayers(repoRoot, flat);
  units.push(...sharedLayers);

  if (units.length < 2) return [];

  // ── Convert to MemorSystem entries ────────────────────────────────

  const systems: MemorSystem[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const sysId = `app-unit-${slugify(u.name)}-${i}`;
    systems.push({
      id: sysId,
      name: u.name,
      type: unitTypeToSystemType(u.unitType),
      systemTier: u.unitType === "route-surface" || u.unitType === "api-layer" ? "primary" : "secondary",
      runtimeRole: u.unitType === "route-surface" ? "runnable" : "consumable",
      importanceScore: unitImportance(u.unitType),
      rootPath: u.rootPath,
      confidence: 0.7,
      description: u.description,
      entryPoints: u.routeFiles.slice(0, 3).map((f) => ({
        path: f,
        kind: u.unitType === "api-layer" ? "api" as const : "web" as const,
        reason: "Route file",
        confidence: 0.7,
      })),
      blocks: [],
      flows: [],
      tags: [],
    });
  }

  // ── Build connections between app units ────────────────────────────

  buildAppUnitConnections(systems, units);

  return systems;
}

// ── Find the app/ or src/app/ directory ──────────────────────────────

function findAppRoot(
  repoRoot: string,
  flat: FlatScanEntry[]
): string | null {
  // Prefer src/app over app
  const srcApp = flat.find(
    (e) => e.isDirectory && (e.relativePath === "src/app" || e.relativePath === "src\\app")
  );
  if (srcApp) return srcApp.fullPath;

  const appDir = flat.find(
    (e) => e.isDirectory && (e.relativePath === "app" || e.relativePath === "pages")
  );
  if (appDir) return appDir.fullPath;

  return null;
}

// ── Route surface detection ─────────────────────────────────────────

function detectRouteSurfaces(
  appRoot: string,
  appRelative: string,
  flat: FlatScanEntry[]
): AppUnit[] {
  const units: AppUnit[] = [];
  const appNorm = path.normalize(appRoot) + path.sep;

  // Find all page.tsx / page.js / route.ts files
  const pageFiles = flat.filter(
    (e) =>
      !e.isDirectory &&
      path.normalize(e.fullPath).startsWith(appNorm) &&
      /^(page|layout)\.(tsx?|jsx?)$/.test(e.name) &&
      !SKIP_DIRS.has(e.name)
  );

  // Group by top-level route segment
  const routeGroups = new Map<string, { files: string[]; segment: string }>();

  for (const pf of pageFiles) {
    const rel = path.relative(appRoot, pf.fullPath);
    const parts = rel.split(path.sep);

    if (parts.length <= 1) {
      // Root page — landing/home
      addToGroup(routeGroups, "__root__", pf.relativePath, "");
      continue;
    }

    // First segment (strip route group parens)
    let segment = parts[0];
    const cleanSegment = segment.replace(/^\(|\)$/g, "");

    // Skip api — handled separately
    if (cleanSegment === "api") continue;

    addToGroup(routeGroups, cleanSegment, pf.relativePath, cleanSegment);
  }

  // Also detect deeper route directories even without page.tsx at top level
  const routeDirs = flat.filter(
    (e) =>
      e.isDirectory &&
      path.normalize(e.fullPath).startsWith(appNorm) &&
      !SKIP_DIRS.has(e.name) &&
      e.name !== "api"
  );

  for (const rd of routeDirs) {
    const rel = path.relative(appRoot, rd.fullPath);
    const parts = rel.split(path.sep);
    if (parts.length !== 1) continue;

    const segment = parts[0];
    if (routeGroups.has(segment)) continue;

    // Check if this directory has any page/layout files inside
    const dirNorm = path.normalize(rd.fullPath) + path.sep;
    const hasPages = flat.some(
      (e) =>
        !e.isDirectory &&
        path.normalize(e.fullPath).startsWith(dirNorm) &&
        /^(page|layout|route)\.(tsx?|jsx?)$/.test(e.name)
    );
    if (hasPages) {
      const files = flat
        .filter(
          (e) =>
            !e.isDirectory &&
            path.normalize(e.fullPath).startsWith(dirNorm) &&
            /^(tsx?|jsx?)$/.test(e.extension)
        )
        .map((e) => e.relativePath);
      routeGroups.set(segment, { files, segment: segment.replace(/^\(|\)$/g, "") });
    }
  }

  // Group related segments into merged surfaces before creating units
  const mergedUnits = new Map<string, AppUnit>();

  for (const [key, group] of routeGroups) {
    if (key === "__root__") {
      mergedUnits.set("__root__", {
        name: "Landing / Home",
        unitType: "route-surface",
        description: "Public landing surface — the main entry experience for visitors.",
        rootPath: appRelative,
        fileCount: group.files.length,
        routeFiles: group.files,
      });
      continue;
    }

    const clean = group.segment;
    const info = classifyRouteSurface(clean);

    const existing = mergedUnits.get(info.name);
    if (existing) {
      existing.fileCount += group.files.length;
      existing.routeFiles.push(...group.files);
    } else {
      mergedUnits.set(info.name, {
        name: info.name,
        unitType: info.unitType,
        description: info.description,
        rootPath: `${appRelative}/${key}`,
        fileCount: group.files.length,
        routeFiles: group.files,
      });
    }
  }

  units.push(...mergedUnits.values());
  return units;
}

function addToGroup(
  map: Map<string, { files: string[]; segment: string }>,
  key: string,
  file: string,
  segment: string
): void {
  const existing = map.get(key);
  if (existing) {
    existing.files.push(file);
  } else {
    map.set(key, { files: [file], segment });
  }
}

function classifyRouteSurface(segment: string): {
  name: string;
  unitType: AppUnitType;
  description: string;
} {
  const lower = segment.toLowerCase();

  if (/^dashboard$/i.test(lower))
    return {
      name: "Dashboard Surface",
      unitType: "route-surface",
      description: "Authenticated product interface where core user workflows are executed.",
    };
  if (/^admin$/i.test(lower))
    return {
      name: "Admin Surface",
      unitType: "route-surface",
      description: "Administrative interface for system management and configuration.",
    };
  if (/^(auth|login|signin|signup|sign-in|sign-up|onboarding)$/i.test(lower))
    return {
      name: "Auth / Onboarding",
      unitType: "route-surface",
      description: "Authentication and onboarding flow — sign-in, sign-up, and session management.",
    };
  if (/^(docs|documentation|help|guide)$/i.test(lower))
    return {
      name: "Docs Surface",
      unitType: "route-surface",
      description: "Documentation and help content for users and developers.",
    };
  if (/^(marketing|about|pricing|blog|landing)$/i.test(lower))
    return {
      name: "Marketing Surface",
      unitType: "route-surface",
      description: "Public-facing marketing and content pages for acquisition and education.",
    };
  if (/^(settings|account|profile|preferences)$/i.test(lower))
    return {
      name: "Settings Surface",
      unitType: "route-surface",
      description: "User settings, account management, and preference configuration.",
    };
  if (/^(privacy|terms|legal)$/i.test(lower))
    return {
      name: "Legal Pages",
      unitType: "route-surface",
      description: "Legal pages including privacy policy and terms of service.",
    };

  // Generic feature route
  const titleCase = segment.charAt(0).toUpperCase() + segment.slice(1);
  return {
    name: `${titleCase} Feature`,
    unitType: "route-surface",
    description: `Feature route surface for the ${lower} workflow.`,
  };
}

// ── API / BFF layer detection ───────────────────────────────────────

function detectApiLayer(
  appRoot: string,
  appRelative: string,
  flat: FlatScanEntry[]
): AppUnit | null {
  const apiDir = path.join(appRoot, "api");
  const apiNorm = path.normalize(apiDir) + path.sep;

  const apiFiles = flat.filter(
    (e) =>
      !e.isDirectory &&
      path.normalize(e.fullPath).startsWith(apiNorm) &&
      /^(tsx?|jsx?)$/.test(e.extension)
  );

  if (apiFiles.length === 0) return null;

  const hasProxy = apiFiles.some((f) => /proxy|forward/i.test(f.relativePath));
  const routeFiles = apiFiles.filter((f) => /route\.(ts|js)$/.test(f.name));

  return {
    name: hasProxy ? "API / BFF Proxy Layer" : "API Route Handlers",
    unitType: "api-layer",
    description: hasProxy
      ? "Server-side proxy handlers that forward browser requests to upstream APIs, keeping secrets server-side."
      : `Server-side API route handlers (${routeFiles.length} endpoints) providing backend logic within the app.`,
    rootPath: `${appRelative}/api`,
    fileCount: apiFiles.length,
    routeFiles: routeFiles.map((f) => f.relativePath),
  };
}

// ── Shared layers (components, lib, hooks, etc.) ────────────────────

function detectSharedLayers(
  repoRoot: string,
  flat: FlatScanEntry[]
): AppUnit[] {
  const units: AppUnit[] = [];

  const LAYER_PATTERNS: {
    dirs: string[];
    name: string;
    unitType: AppUnitType;
    description: string;
  }[] = [
    {
      dirs: ["src/components", "components", "src/ui"],
      name: "Shared Components",
      unitType: "shared-ui",
      description: "Reusable UI building blocks used across public and product surfaces.",
    },
    {
      dirs: ["src/lib", "lib", "src/utils", "utils", "src/helpers"],
      name: "Data / Lib Layer",
      unitType: "data-layer",
      description: "Application helpers, data access utilities, and feature logic supporting route behavior.",
    },
    {
      dirs: ["src/hooks", "hooks"],
      name: "Custom Hooks",
      unitType: "data-layer",
      description: "Reusable React hooks encapsulating shared stateful logic and side effects.",
    },
    {
      dirs: ["src/services", "services"],
      name: "Services Layer",
      unitType: "integration-layer",
      description: "Service modules for external API communication, data fetching, and business logic.",
    },
    {
      dirs: ["src/store", "src/state", "src/redux", "store", "src/context", "src/providers", "src/contexts"],
      name: "State / Providers",
      unitType: "state-layer",
      description: "Application state management, context providers, and global data stores.",
    },
  ];

  for (const pattern of LAYER_PATTERNS) {
    for (const dir of pattern.dirs) {
      const dirNorm = path.normalize(path.join(repoRoot, dir)) + path.sep;
      const files = flat.filter(
        (e) =>
          !e.isDirectory &&
          path.normalize(e.fullPath).startsWith(dirNorm) &&
          /^(tsx?|jsx?)$/.test(e.extension)
      );
      if (files.length >= 1) {
        // Merge if same unitType already found
        const existing = units.find((u) => u.unitType === pattern.unitType);
        if (existing) {
          existing.fileCount += files.length;
          existing.routeFiles.push(...files.map((f) => f.relativePath));
        } else {
          units.push({
            name: pattern.name,
            unitType: pattern.unitType,
            description: pattern.description,
            rootPath: dir,
            fileCount: files.length,
            routeFiles: files.map((f) => f.relativePath).slice(0, 5),
          });
        }
        break; // Found for this pattern, move on
      }
    }
  }

  return units;
}

// ── Convert unit types to system types ───────────────────────────────

function unitTypeToSystemType(ut: AppUnitType): SystemType {
  switch (ut) {
    case "route-surface": return "web-app";
    case "api-layer": return "api-service";
    case "shared-ui": return "ui-library";
    case "data-layer": return "shared-package";
    case "state-layer": return "shared-package";
    case "integration-layer": return "shared-package";
    case "support-layer": return "support-system";
  }
}

function unitImportance(ut: AppUnitType): number {
  switch (ut) {
    case "route-surface": return 0.8;
    case "api-layer": return 0.75;
    case "shared-ui": return 0.65;
    case "data-layer": return 0.6;
    case "integration-layer": return 0.6;
    case "state-layer": return 0.55;
    case "support-layer": return 0.4;
  }
}

// ── Build connections between app units ──────────────────────────────

function buildAppUnitConnections(
  systems: MemorSystem[],
  units: AppUnit[]
): void {
  const sysMap = new Map(systems.map((s, i) => [units[i].unitType + ":" + units[i].name, s]));
  const byType = (t: AppUnitType) => systems.filter((_, i) => units[i].unitType === t);

  const routeSurfaces = byType("route-surface");
  const apiLayers = byType("api-layer");
  const uiLayers = byType("shared-ui");
  const dataLayers = byType("data-layer");
  const stateLayers = byType("state-layer");

  for (const surface of routeSurfaces) {
    surface.connections = { outgoing: [], incoming: [] };

    // Route surfaces → shared components
    for (const ui of uiLayers) {
      if (!ui.connections) ui.connections = { outgoing: [], incoming: [] };
      surface.connections.outgoing.push({
        targetSystemId: ui.id,
        targetSystemName: ui.name,
        relation: "uses",
        confidence: 0.8,
        reason: "Route pages import and render shared UI components.",
      });
      ui.connections.incoming.push({
        targetSystemId: surface.id,
        targetSystemName: surface.name,
        relation: "used-by",
        confidence: 0.8,
        reason: `${surface.name} renders components from this layer.`,
      });
    }

    // Route surfaces → API layer
    for (const api of apiLayers) {
      if (!api.connections) api.connections = { outgoing: [], incoming: [] };
      surface.connections.outgoing.push({
        targetSystemId: api.id,
        targetSystemName: api.name,
        relation: "uses",
        confidence: 0.75,
        reason: "Dashboard/product pages call API route handlers for data.",
      });
      api.connections.incoming.push({
        targetSystemId: surface.id,
        targetSystemName: surface.name,
        relation: "used-by",
        confidence: 0.75,
        reason: `${surface.name} sends requests to API proxy endpoints.`,
      });
    }

    // Route surfaces → data/lib layer
    for (const dl of dataLayers) {
      if (!dl.connections) dl.connections = { outgoing: [], incoming: [] };
      surface.connections.outgoing.push({
        targetSystemId: dl.id,
        targetSystemName: dl.name,
        relation: "uses",
        confidence: 0.7,
        reason: "Route pages import helpers and data utilities from the lib layer.",
      });
      dl.connections.incoming.push({
        targetSystemId: surface.id,
        targetSystemName: surface.name,
        relation: "used-by",
        confidence: 0.7,
        reason: `${surface.name} uses data helpers from this layer.`,
      });
    }
  }

  // API layer → data/lib layer
  for (const api of apiLayers) {
    if (!api.connections) api.connections = { outgoing: [], incoming: [] };
    for (const dl of dataLayers) {
      if (!dl.connections) dl.connections = { outgoing: [], incoming: [] };
      api.connections.outgoing.push({
        targetSystemId: dl.id,
        targetSystemName: dl.name,
        relation: "uses",
        confidence: 0.7,
        reason: "API handlers use lib utilities for request processing and data access.",
      });
      dl.connections.incoming.push({
        targetSystemId: api.id,
        targetSystemName: api.name,
        relation: "used-by",
        confidence: 0.7,
        reason: "API layer imports helpers from the data/lib layer.",
      });
    }
  }
}
