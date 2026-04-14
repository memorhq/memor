import type { MemorSystem } from "../types";

export type SystemNarrative = {
  shortDescription: string;
  confidence: "high" | "medium" | "low";
  reasoning: string[];
};

// ── Priority 1: package.json description (NEVER overridden) ───────────

function fromPackageJson(
  sys: MemorSystem,
  repoName: string,
  centerDescription?: string
): SystemNarrative | null {
  const desc = sys.packageDescription;
  if (!desc || desc.length <= 8) return null;
  // Skip placeholder/TODO descriptions
  if (/^\s*TODO/i.test(desc)) return null;
  // Skip descriptions that are just the package name
  if (desc.toLowerCase().replace(/[^a-z0-9]/g, "") === sys.name.toLowerCase().replace(/[^a-z0-9]/g, "")) return null;

  const isCenter =
    sys.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
    repoName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // If a non-center package has the same description as the center (or the shared
  // monorepo tagline), it's a copy-paste artifact — skip it so name-patterns or
  // enrichment can provide something more specific.
  if (!isCenter && centerDescription) {
    const normalizedDesc = desc.replace(/\s*\(@[^)]+\)\s*$/, "").trim();
    const normalizedCenter = centerDescription.replace(/\s*\(@[^)]+\)\s*$/, "").trim();
    if (normalizedDesc === normalizedCenter) return null;
  }

  const short = desc;

  return {
    shortDescription: short,
    confidence: "high",
    reasoning: [`[package.json] "${desc}"`],
  };
}

// ── Priority 2: Non-package system templates ──────────────────────────

const NON_PACKAGE_TEMPLATES: Record<string, (repoName: string) => string> = {
  compiler:      (rn) => `Build-time compiler for ${rn}, transforms source into optimized runtime output.`,
  scripts:       (rn) => `Build, release, and automation scripts for the ${rn} repository.`,
  examples:      (rn) => `Example applications demonstrating ${rn} usage patterns.`,
  benchmark:     (rn) => `Performance benchmarking suite for ${rn}.`,
  benchmarking:  (rn) => `Performance benchmarking suite for ${rn}.`,
  fixtures:      (rn) => `Test fixtures and reference data for ${rn} regression testing.`,
  playground:    (rn) => `Interactive sandbox for testing and experimentation with ${rn}.`,
  playgrounds:   (rn) => `Interactive sandboxes for testing and experimentation with ${rn}.`,
  documentation: (rn) => `Documentation source and developer guides for ${rn}.`,
  docs:          (rn) => `Documentation source and developer guides for ${rn}.`,
  e2e:           (rn) => `End-to-end test infrastructure for ${rn}.`,
};

function fromNonPackageTemplate(sys: MemorSystem, repoName: string): SystemNarrative | null {
  if (sys.type !== "support-system") return null;
  const lower = sys.name.toLowerCase();
  const templateFn = NON_PACKAGE_TEMPLATES[lower];
  if (!templateFn) return null;
  return {
    shortDescription: templateFn(repoName),
    confidence: "medium",
    reasoning: [`[non-package:${lower}] Known architectural directory.`],
  };
}

// ── Priority 3: Precise name-pattern matching with exclusions ─────────

type NameRule = {
  id: string;
  match: (name: string, sys: MemorSystem) => boolean;
  describe: (name: string, sys: MemorSystem, repoName: string) => string;
};

const NAME_RULES: NameRule[] = [
  // Language tools (MUST come before "server" to prevent language-server misfire)
  {
    id: "language-tools",
    match: (n) =>
      /language.?server/i.test(n) || /\blsp\b/i.test(n) ||
      /\bcheck$/i.test(n) || /^ts-plugin$/i.test(n),
    describe: (n) =>
      /language.?server/i.test(n)
        ? "Language server providing editor tooling: autocomplete, diagnostics, and code intelligence."
        : /\bcheck$/i.test(n)
        ? "Type-checking CLI for validating project code from the command line."
        : "Editor integration plugin providing enhanced IDE support.",
  },
  {
    id: "vscode",
    match: (n) => /\bvscode\b/i.test(n),
    describe: () => "VS Code extension providing syntax highlighting, diagnostics, and editor-level integration.",
  },
  // DevTools (with variant differentiation)
  {
    id: "devtools",
    match: (n) => /\bdevtools?\b/i.test(n),
    describe: (n) => {
      if (/shared/i.test(n)) return "Shared infrastructure powering the DevTools UI and data protocols.";
      if (/extension/i.test(n)) return "Browser extension for inspecting and debugging application state.";
      if (/inline/i.test(n)) return "Embeddable DevTools variant for rendering inspection UI inside a host page.";
      if (/shell/i.test(n)) return "Standalone DevTools shell for development and testing of the DevTools UI itself.";
      if (/fusebox/i.test(n)) return "DevTools integration for React Native debugging via Fusebox.";
      if (/timeline/i.test(n)) return "Timeline profiler for visualizing scheduling and rendering performance.";
      if (/core/i.test(n)) return "Core DevTools module used by standalone and embedded variants.";
      return "Developer tools for inspecting, profiling, and debugging application state.";
    },
  },
  // Renderers (MUST come before generic "server" and "dom")
  {
    id: "renderer",
    match: (n) =>
      /renderer/i.test(n) && !/test/i.test(n) && !/noop/i.test(n),
    describe: (n) => {
      if (/native/i.test(n)) return "React renderer for native mobile platforms, translating reconciliation output into native UI updates.";
      return "Custom renderer translating framework reconciliation output into host-specific UI updates.";
    },
  },
  {
    id: "noop-renderer",
    match: (n) => /noop.?renderer/i.test(n),
    describe: () => "No-op renderer used for testing the reconciler and server rendering without a real host environment.",
  },
  // Server-DOM transport
  {
    id: "server-dom",
    match: (n) => /server.?dom/i.test(n),
    describe: (n) => {
      const bundler = extractBundlerName(n);
      return bundler
        ? `Server Components transport layer for ${bundler}, enabling streaming between server and client.`
        : "Server Components transport layer for streaming between server and client runtimes.";
    },
  },
  // DOM bindings (NOT devtools, NOT test, NOT server-dom)
  {
    id: "dom",
    match: (n) =>
      /\bdom\b/i.test(n) &&
      !/devtools/i.test(n) && !/test/i.test(n) && !/server/i.test(n),
    describe: (n, sys, rn) => {
      if (/bindings/i.test(n))
        return `Internal DOM binding layer connecting ${rn}'s reconciler to browser APIs.`;
      return `Renderer binding ${rn}'s reconciliation engine to the browser DOM.`;
    },
  },
  // Server (NOT server-dom, NOT language-server)
  {
    id: "server",
    match: (n) =>
      /\bserver\b/i.test(n) &&
      !/dom/i.test(n) && !/language/i.test(n) && !/devtools/i.test(n),
    describe: (_, _s, rn) =>
      `Server-side rendering and streaming entry points for ${rn}.`,
  },
  // Client
  {
    id: "client",
    match: (n) =>
      /\bclient\b/i.test(n) && !/devtools/i.test(n) && !/test/i.test(n),
    describe: (_, _s, rn) =>
      `Client-side streaming and hydration support for ${rn}.`,
  },
  // Core runtime names
  {
    id: "reconciler",
    match: (n) => /\breconciler\b/i.test(n),
    describe: () =>
      "Core reconciliation engine for diffing virtual representations and applying updates to host targets.",
  },
  {
    id: "scheduler",
    match: (n) => /\bscheduler\b/i.test(n),
    describe: () =>
      "Cooperative scheduling primitives for prioritizing, batching, and yielding work.",
  },
  {
    id: "shared",
    match: (n) => /^shared$|^common$/i.test(n),
    describe: () =>
      "Shared internal utilities and constants consumed by multiple sibling packages.",
  },
  // CLI / scaffolding
  {
    id: "create-cli",
    match: (n) => /^create-/i.test(n),
    describe: (_, _s, rn) =>
      `Project scaffolding CLI for creating new ${rn} projects from templates.`,
  },
  // Compiler
  {
    id: "compiler",
    match: (n, s) =>
      /\bcompiler\b/i.test(n) || (s.type === "support-system" && /compiler/i.test(s.rootPath)),
    describe: (_, _s, rn) =>
      `Build-time compiler that transforms ${rn} source into optimized runtime output.`,
  },
  // Refresh / HMR
  {
    id: "refresh",
    match: (n) => /\brefresh\b/i.test(n),
    describe: (_, _s, rn) =>
      `Fast Refresh (HMR) integration enabling instant feedback during ${rn} development.`,
  },
  // Test utilities
  {
    id: "test",
    match: (n) =>
      /\btest(?:ing)?\b/i.test(n) || /\bjest\b/i.test(n) || /\bfixture/i.test(n),
    describe: (n) => {
      if (/jest/i.test(n)) return "Jest integration providing custom matchers and test environment for the framework.";
      if (/fixture/i.test(n)) return "Test fixtures and reference cases for regression testing.";
      if (/suspense/i.test(n)) return "Test utilities for validating Suspense boundaries and async rendering behavior.";
      if (/test-renderer/i.test(n)) return "Lightweight renderer for snapshot testing components without a DOM.";
      if (/test-utils/i.test(n)) return "Internal test utilities and helpers shared across the test suite.";
      if (/dom.?event/i.test(n)) return "Test utilities for simulating and validating DOM events.";
      if (/testing.?library/i.test(n)) return "Testing library utilities for behavior-driven component tests.";
      return "Test utilities and helpers for framework testing infrastructure.";
    },
  },
  // Linting
  {
    id: "lint",
    match: (n) => /\beslint\b/i.test(n) || /\blint\b/i.test(n),
    describe: (n) => {
      if (/hooks/i.test(n)) return "ESLint plugin enforcing rules of Hooks and dependency validation.";
      return "Linting rules and code quality enforcement for the framework ecosystem.";
    },
  },
  // Content / markdown
  {
    id: "content",
    match: (n) =>
      /\bprism\b/i.test(n) || /\bmarkdown\b/i.test(n) ||
      /\bremark\b/i.test(n) || /\bmdx\b/i.test(n) || /\bmarkdoc\b/i.test(n),
    describe: (n) => {
      if (/prism/i.test(n)) return "Syntax highlighting integration using Prism for code blocks.";
      if (/remark/i.test(n)) return "Remark-based Markdown processing pipeline.";
      if (/mdx/i.test(n)) return "MDX support enabling JSX components inside Markdown content.";
      if (/markdoc/i.test(n)) return "Markdoc integration for structured, extensible Markdown content.";
      return "Content processing for Markdown and related formats.";
    },
  },
  // Adapter / platform
  {
    id: "adapter",
    match: (n) => /\badapter\b/i.test(n) || isAdapterName(n),
    describe: (n) => {
      const platform = cleanAdapterName(n);
      return `Deployment adapter for ${platform}, translating build output to the platform's runtime format.`;
    },
  },
  // Telemetry
  {
    id: "telemetry",
    match: (n) => /\btelemetry\b/i.test(n),
    describe: () => "Anonymous usage telemetry for measuring adoption and guiding framework improvements.",
  },
  // Upgrade / migration
  {
    id: "upgrade",
    match: (n) => /\bupgrade\b/i.test(n) || /\bmigrat/i.test(n),
    describe: (_, _s, rn) => `Version migration tool helping projects upgrade between ${rn} releases.`,
  },
  // RSS
  {
    id: "rss",
    match: (n) => /\brss\b/i.test(n),
    describe: (_, _s, rn) => `RSS feed generation helper for ${rn} projects.`,
  },
  // DB
  {
    id: "db",
    match: (n) => /\bdb\b/i.test(n) || /\bdatabase\b/i.test(n),
    describe: () => "Data layer providing database access, schema management, or ORM capabilities.",
  },
  // Debug tools (non-devtools)
  {
    id: "debug-tools",
    match: (n) => /\bdebug.?tools?\b/i.test(n),
    describe: () => "Debugging utilities for programmatic inspection of component trees and state.",
  },
  // Brand checking (react-is)
  {
    id: "is-check",
    match: (n) => /-is$/i.test(n),
    describe: (_, _s, rn) => `Runtime type-checking utilities for identifying ${rn} element types.`,
  },
];

function extractBundlerName(name: string): string | null {
  const match = name.match(/server.?dom.?(esm|webpack|parcel|turbopack|fb|unbundled)/i);
  if (!match) return null;
  const MAP: Record<string, string> = {
    esm: "ESM imports",
    webpack: "Webpack",
    parcel: "Parcel",
    turbopack: "Turbopack",
    fb: "Meta's internal bundler",
    unbundled: "unbundled Node.js environments",
  };
  return MAP[match[1].toLowerCase()] || match[1];
}

const ADAPTER_NAMES = /^(node|cloudflare|vercel|netlify|deno|bun)$/i;

function isAdapterName(name: string): boolean {
  return ADAPTER_NAMES.test(name);
}

function cleanAdapterName(name: string): string {
  const match = name.match(ADAPTER_NAMES);
  if (match) {
    const MAP: Record<string, string> = {
      node: "Node.js", cloudflare: "Cloudflare Workers",
      vercel: "Vercel", netlify: "Netlify", deno: "Deno", bun: "Bun",
    };
    return MAP[match[0].toLowerCase()] || match[0];
  }
  return name;
}

// ── Priority 4: Extends-relationship based ────────────────────────────

function fromExtendsRelation(sys: MemorSystem, repoName: string): SystemNarrative | null {
  const ext = sys.connections?.outgoing?.find((c) => c.relation === "extends");
  if (!ext) return null;

  const n = sys.name.toLowerCase();
  const inc = sys.connections?.incoming?.length || 0;
  const depNote = inc > 0 ? ` — ${inc} package${inc > 1 ? "s" : ""} depend${inc === 1 ? "s" : ""} on it` : "";

  // If the system has a meaningful name, use it for a richer description
  if (/\bcore\b/i.test(n))
    return { shortDescription: `Core ${repoName} module, extends ${ext.targetSystemName}${depNote}.`, confidence: "medium", reasoning: [`[extends:core] Core module extending ${ext.targetSystemName}.`] };
  if (/\bmicroservice/i.test(n))
    return { shortDescription: `Microservices support for ${repoName}, extends ${ext.targetSystemName}${depNote}.`, confidence: "medium", reasoning: [`[extends:microservices]`] };
  if (/platform[-_](\w+)/i.test(n)) {
    const raw = n.match(/platform[-_](\S+)/i)?.[1] || n;
    const PLATFORM_NAMES: Record<string, string> = {
      express: "Express", fastify: "Fastify", ws: "WebSocket (ws)",
      "socket.io": "Socket.io", "socket-io": "Socket.io", koa: "Koa",
      hapi: "Hapi", deno: "Deno", bun: "Bun",
    };
    const platform = PLATFORM_NAMES[raw] || capitalize(raw);
    return { shortDescription: `${platform} platform adapter for ${repoName}, extends ${ext.targetSystemName}${depNote}.`, confidence: "medium", reasoning: [`[extends:platform]`] };
  }
  if (/\bwebsocket/i.test(n) || /\bws\b/i.test(n))
    return { shortDescription: `WebSocket support for ${repoName}, extends ${ext.targetSystemName}${depNote}.`, confidence: "medium", reasoning: [`[extends:websocket]`] };


  return {
    shortDescription: `${sys.name} extends ${ext.targetSystemName}${depNote}.`,
    confidence: "medium",
    reasoning: [`[connection:extends] Extends ${ext.targetSystemName}.`],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Main generator ────────────────────────────────────────────────────

export function generateSystemNarrative(
  sys: MemorSystem,
  repoName: string,
  centerDescription?: string
): SystemNarrative {
  // P1: package.json description — ALWAYS wins (unless it's a monorepo copy-paste)
  const pkg = fromPackageJson(sys, repoName, centerDescription);
  if (pkg) return pkg;

  // P2: Non-package system templates
  const nonPkg = fromNonPackageTemplate(sys, repoName);
  if (nonPkg) return nonPkg;

  // P3: Precise name-pattern matching with exclusions
  const n = sys.name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.match(n, sys)) {
      return {
        shortDescription: rule.describe(n, sys, repoName),
        confidence: "medium",
        reasoning: [`[name-rule:${rule.id}] Matched pattern for ${sys.name}.`],
      };
    }
  }

  // P4: Extends relationship
  const ext = fromExtendsRelation(sys, repoName);
  if (ext) return ext;

  // P4b: README excerpt (between extends-relationship and plain fallback)
  if (sys.readmeExcerpt && sys.readmeExcerpt.length > 20) {
    return {
      shortDescription: sys.readmeExcerpt,
      confidence: "medium",
      reasoning: [`[readme] Extracted from README.md`],
    };
  }

  // P5: Fallback — keep existing description
  return {
    shortDescription: sys.description || `Package: ${sys.name}.`,
    confidence: "low",
    reasoning: ["No specific evidence found; using existing description."],
  };
}

/**
 * Generate narratives for all systems, apply them, then deduplicate siblings.
 */
export function applyNarratives(
  systems: MemorSystem[],
  repoName: string
): Map<string, SystemNarrative> {
  const narratives = new Map<string, SystemNarrative>();
  const rn = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Find the center system's packageDescription so we can detect monorepo
  // copy-paste artifacts (non-center packages with the same generic description)
  const center = systems.find(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === rn
  );

  // Also detect "copy-paste" descriptions: when 60%+ of systems share the same
  // base description (ignoring scope suffixes like (@common)), treat it as the
  // generic project tagline that non-center systems should skip.
  const descCounts = new Map<string, number>();
  for (const s of systems) {
    if (!s.packageDescription) continue;
    const normalized = s.packageDescription.replace(/\s*\(@[^)]+\)\s*$/, "").trim();
    descCounts.set(normalized, (descCounts.get(normalized) || 0) + 1);
  }
  let sharedDesc: string | undefined;
  for (const [desc, count] of descCounts) {
    if (count >= Math.max(2, systems.length * 0.5)) {
      sharedDesc = desc;
      break;
    }
  }
  const centerDesc = center?.packageDescription || sharedDesc;

  for (const sys of systems) {
    const narrative = generateSystemNarrative(sys, repoName, centerDesc);
    narratives.set(sys.id, narrative);
    const GENERIC_DESCRIPTIONS = [
      "provides shared runtime utilities",
      "provides runtime utilities",
      "shared runtime utilities",
      "provides utilities",
    ];
    const isGeneric = GENERIC_DESCRIPTIONS.some((g) =>
      narrative.shortDescription.toLowerCase().includes(g)
    );
    if (
      narrative.shortDescription.length > 10 &&
      !narrative.shortDescription.startsWith("Package:") &&
      !isGeneric
    ) {
      sys.description = narrative.shortDescription;
    }
  }

  deduplicateSiblings(systems);

  return narratives;
}

// ── Sibling deduplication ─────────────────────────────────────────────

function deduplicateSiblings(systems: MemorSystem[]): void {
  const byDesc = new Map<string, MemorSystem[]>();
  for (const sys of systems) {
    const key = sys.description;
    const arr = byDesc.get(key) || [];
    arr.push(sys);
    byDesc.set(key, arr);
  }

  for (const [, group] of byDesc) {
    if (group.length < 2) continue;

    for (const sys of group) {
      const suffix = deriveSuffix(sys);
      if (suffix) {
        sys.description = sys.description.replace(/\.$/, "") + ` (${suffix}).`;
      }
    }
  }
}

function deriveSuffix(sys: MemorSystem): string | null {
  const n = sys.name.toLowerCase();
  const parts = n.split(/[-_./]/);

  // Walk backwards through name parts, skipping noise
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && part.length >= 2 && !NOISE_SUFFIXES.has(part)) {
      // Don't use a part that's too common to differentiate (e.g. the repo name prefix)
      if (i === 0 && parts.length > 1) continue;
      return part;
    }
  }

  // Path-based differentiator
  if (sys.rootPath && sys.rootPath !== ".") {
    const pathParts = sys.rootPath.split("/");
    const lastDir = pathParts[pathParts.length - 1];
    if (lastDir && lastDir !== sys.name) return lastDir;
  }

  return null;
}

const NOISE_SUFFIXES = new Set([
  "shared", "common", "utils", "helpers", "lib",
  "package", "module", "src", "dist", "build",
]);
