import type {
  AppArchetype,
  BlockType,
  MemorSystem,
  PackageArchetype,
  SupportRole,
  SystemRoleHint,
} from "../types";

// ── Role hint sentences (highest priority) ────────────────────────────

function roleHintSentence(hint: SystemRoleHint, sys: MemorSystem): string {
  const name = sys.name;
  const tech = sys.detectedTech?.filter((t) => !/^(TypeScript|JavaScript)$/i.test(t))[0];
  const techNote = tech ? ` (${tech})` : "";
  const inc = sys.connections?.incoming?.length || 0;
  const depNote = inc > 0 ? ` — ${inc} package${inc > 1 ? "s" : ""} depend${inc === 1 ? "s" : ""} on it` : "";

  switch (hint) {
    case "framework-core-package":
      return `${name}${techNote} is the framework core${depNote}.`;
    case "framework-adapter-package":
      return `${name}${techNote} is a platform adapter, binding the framework to a specific runtime${depNote}.`;
    case "framework-tooling-package":
      return `${name} provides framework tooling for development, testing, or code generation.`;
    case "primary-library-package":
      // Prefer the author's own description when available — it's more specific than "primary library package"
      if (sys.packageDescription) return `${name}: ${sys.packageDescription}`;
      return `${name}${techNote} is the primary library package${depNote}.`;
    case "workflow-core-package":
      return `${name} is the core workflow engine, handling scheduling and task execution${depNote}.`;
    case "workflow-provider-package":
      return `${name} provides workflow operators or connectors that extend the platform.`;
    case "workflow-support-package":
      return `${name} is a support package within the workflow ecosystem.`;
    default:
      return "";
  }
}

// ── App archetype sentences ───────────────────────────────────────────

function appArchetypeSentence(arch: AppArchetype, sys: MemorSystem): string {
  const name = sys.name;
  const tech = sys.detectedTech?.filter((t) => !/^(TypeScript|JavaScript)$/i.test(t));
  const techNote = tech && tech.length > 0 ? ` built with ${tech.slice(0, 2).join(", ")}` : "";
  const blocks = sys.blocks
    .filter((b) => !NOISE_BLOCKS.has(b.type))
    .map((b) => BLOCK_SEMANTIC_LABELS[b.type])
    .filter((l): l is string => !!l);
  const blockNote = blocks.length > 0 ? ` Contains ${[...new Set(blocks)].slice(0, 3).join(", ")}.` : "";

  switch (arch) {
    case "marketing-site":
      return `${name} is the public-facing marketing site${techNote}.${blockNote}`;
    case "docs-app":
      return `${name} is the documentation app${techNote}, serving guides and reference content.${blockNote}`;
    case "admin-app":
      return `${name} is the admin interface${techNote}, handling internal workflows and management.${blockNote}`;
    case "component-showcase":
      return `${name} is a component showcase${techNote}, used to preview and validate reusable UI.${blockNote}`;
    case "learning-app":
      return `${name} is a learning app${techNote}, focused on tutorials and examples.${blockNote}`;
    case "product-app":
      return `${name} is the main product app${techNote} where users interact with core workflows.${blockNote}`;
    default:
      return "";
  }
}

// ── Package archetype sentences ───────────────────────────────────────

function archetypeSentence(arch: PackageArchetype, sys: MemorSystem): string {
  const name = sys.name;
  const inc = sys.connections?.incoming?.length || 0;
  const usedBy = inc > 0 ? `, used by ${inc} other system${inc > 1 ? "s" : ""}` : "";

  switch (arch) {
    case "ui-library":
      return `${name} is a reusable UI package${usedBy}.`;
    case "database-package":
      return `${name} handles data access and schema management${usedBy}.`;
    case "config-package":
      return `${name} provides shared configuration${usedBy}.`;
    case "types-package":
      return `${name} defines shared TypeScript types imported across the codebase${usedBy}.`;
    case "integration-package":
      return `${name} integrates with external services${usedBy}.`;
    case "feature-package":
      return `${name} is a feature module consumed by host applications${usedBy}.`;
    case "localization-package":
      return `${name} provides localization and translations.`;
    case "email-package":
      return `${name} handles email templates and delivery.`;
    case "embeddable-package":
      return `${name} is an embeddable widget package${usedBy}.`;
    case "platform-package":
      return `${name} is a shared platform foundation${usedBy}.`;
    case "tooling-package":
      return `${name} provides build tooling and developer utilities.`;
    case "utility-package":
      return `${name} is a shared utilities package${usedBy}.`;
    case "documentation-package":
      return `${name} contains documentation and content.`;
    default:
      return "";
  }
}

// ── Support-role sentences ────────────────────────────────────────────

function supportRoleSentence(role: SupportRole, sys: MemorSystem): string {
  const name = sys.name;
  const inc = sys.connections?.incoming?.length || 0;
  const usedBy = inc > 0 ? ` — ${inc} system${inc > 1 ? "s" : ""} depend${inc === 1 ? "s" : ""} on it` : "";

  switch (role) {
    case "development-tooling":
      return `${name} supports local tooling and dev workflows.`;
    case "ecosystem-extension":
      return `${name} provides ecosystem integrations${usedBy}.`;
    case "shared-contracts":
      return `${name} provides shared contracts and types used across the codebase${usedBy}.`;
    case "runtime-support":
      return `${name} provides shared runtime utilities${usedBy}.`;
    case "packaging-distribution":
      return `${name} handles packaging and asset distribution.`;
    case "docs-content":
      return `${name} contains documentation and reference content.`;
    case "test-harness":
      return `${name} provides test utilities and harness infrastructure.`;
    case "adapter-bridge":
      return `${name} bridges the framework to another runtime or platform${usedBy}.`;
    case "workflow-logic":
      return `${name} contains workflow and orchestration logic${usedBy}.`;
    case "infra-config-support":
      return `${name} provides infrastructure configuration and deployment support.`;
    case "devtools-instrumentation":
      return `${name} provides developer tools for debugging and profiling.`;
    case "renderer-binding":
      return `${name} is a renderer binding for the framework${usedBy}.`;
    case "cli-utility":
      return `${name} provides CLI tooling.`;
  }
}

// ── Block semantic labels for narrative ───────────────────────────────

const BLOCK_SEMANTIC_LABELS: Partial<Record<BlockType, string>> = {
  routes: "routing",
  "ui-components": "UI components",
  features: "feature modules",
  state: "state management",
  "api-layer": "API surfaces",
  services: "services",
  database: "data access",
  integrations: "integrations",
  schemas: "schemas",
  "server-code": "server logic",
  "client-code": "client logic",
  hooks: "hooks",
  adapters: "adapters",
  providers: "providers",
  operators: "operators",
  workflows: "workflows",
  tasks: "tasks",
  plugins: "plugins",
  transport: "transport",
  orchestration: "orchestration",
  sdks: "SDKs",
  cli: "CLI tooling",
  "library-code": "library code",
};

const NOISE_BLOCKS = new Set<BlockType>([
  "tests", "mocks", "scripts", "config", "static-assets",
  "generated-code", "constants", "type-definitions", "templates",
  "docs", "examples", "unknown", "database-migrations", "localization",
  "email-module", "embeddable-components", "domain-package", "source-tree",
]);

// ── Relaxed block labels (includes structural/noise blocks for fallback) ──

const RELAXED_BLOCK_LABELS: Partial<Record<BlockType, string>> = {
  ...BLOCK_SEMANTIC_LABELS,
  tests: "tests",
  config: "configuration",
  scripts: "build scripts",
  "source-tree": "source code",
  "static-assets": "static assets",
  docs: "documentation",
  examples: "examples",
  mocks: "test fixtures",
  "type-definitions": "type definitions",
  "database-migrations": "database migrations",
  templates: "templates",
  "generated-code": "generated code",
  constants: "constants",
  localization: "localization files",
  "email-module": "email templates",
  "embeddable-components": "embeddable components",
  "domain-package": "domain modules",
};

// ── Name-derived differentiation ──────────────────────────────────────

const NOISE_NAME_TOKENS = new Set([
  "shared", "common", "core", "internal", "base", "main",
  "utils", "util", "lib", "pkg", "package", "module",
  "helpers", "helper", "support", "use",
]);

const TOKEN_DISPLAY: Record<string, string> = {
  dom: "DOM", ui: "UI", api: "API", cli: "CLI", sdk: "SDK",
  db: "database", auth: "authentication", i18n: "internationalization",
  sms: "SMS", esm: "ESM", ssr: "SSR", cjs: "CJS",
  ws: "WebSocket", http: "HTTP", graphql: "GraphQL", grpc: "gRPC",
  ctl: "control", devtools: "developer tools", ai: "AI",
};

function deriveNamePurpose(name: string, repoName?: string): string | null {
  let cleaned = name.toLowerCase();

  if (repoName) {
    const prefix = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned.startsWith(prefix + "-") && cleaned.length > prefix.length + 2) {
      cleaned = cleaned.slice(prefix.length + 1);
    }
  }

  const tokens = cleaned
    .split(/[-_./]/)
    .filter((t) => t.length > 1 && !NOISE_NAME_TOKENS.has(t));

  const unique = [...new Set(tokens)];
  if (unique.length === 0) return null;

  const result = unique.map((t) => TOKEN_DISPLAY[t] || t).join(" ");
  if (result.length < 3) return null;

  return result;
}


// ── Block-based sentence helpers ──────────────────────────────────────

function blockSemanticSentence(system: MemorSystem): string | null {
  const meaningful = system.blocks
    .filter((b) => !NOISE_BLOCKS.has(b.type))
    .map((b) => BLOCK_SEMANTIC_LABELS[b.type])
    .filter((label): label is string => !!label);

  const unique = [...new Set(meaningful)];
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    return `This package is primarily composed of ${unique[0]}.`;
  }
  if (unique.length <= 3) {
    return `This package contains ${unique.join(", ")}.`;
  }
  return `This package contains ${unique.slice(0, 3).join(", ")}, and other modules.`;
}

function groundedBlockSentence(system: MemorSystem): string | null {
  const name = system.name;
  const meaningful = system.blocks
    .filter((b) => !NOISE_BLOCKS.has(b.type))
    .map((b) => BLOCK_SEMANTIC_LABELS[b.type])
    .filter((label): label is string => !!label);

  const unique = [...new Set(meaningful)];
  if (unique.length === 0) return null;

  const inc = system.connections?.incoming?.length || 0;
  const usedBy = inc > 0 ? `, used by ${inc} other system${inc > 1 ? "s" : ""}` : "";

  if (unique.length === 1) {
    return `${name} is primarily ${unique[0]}${usedBy}.`;
  }
  if (unique.length <= 3) {
    return `${name} contains ${unique.join(", ")}${usedBy}.`;
  }
  return `${name} contains ${unique.slice(0, 3).join(", ")}, and more${usedBy}.`;
}

function relaxedBlockSentence(system: MemorSystem): string | null {
  if (system.blocks.length === 0) return null;

  const labels = [...new Set(
    system.blocks
      .map((b) => RELAXED_BLOCK_LABELS[b.type])
      .filter((l): l is string => !!l)
  )];

  if (labels.length === 0) return null;
  if (labels.length === 1) return `It contains ${labels[0]}.`;
  if (labels.length <= 3) return `It contains ${labels.join(", ")}.`;
  return `It contains ${labels.slice(0, 3).join(", ")}, and other modules.`;
}

// ── Mixed-signal / ambiguity sentence ─────────────────────────────────

function mixedSignalSentence(system: MemorSystem): string | null {
  if (system.systemRoleHint && system.systemRoleHint !== "unknown") return null;
  if (system.packageArchetype && system.packageArchetype !== "unknown") return null;
  if (system.appArchetype && system.appArchetype !== "unknown") return null;

  const types = new Set(system.blocks.map((b) => b.type));
  const meaningfulCount = system.blocks.filter((b) => !NOISE_BLOCKS.has(b.type)).length;
  if (meaningfulCount < 2) return null;

  const hasUI = types.has("ui-components") || types.has("hooks");
  const hasServer = types.has("server-code") || types.has("api-layer") || types.has("services") || types.has("database");
  const hasSchema = types.has("schemas");
  const hasIntegration = types.has("integrations") || types.has("adapters") || types.has("providers");

  const concerns: string[] = [];
  if (hasUI) concerns.push("UI");
  if (hasServer) concerns.push("server");
  if (hasSchema) concerns.push("schema");
  if (hasIntegration) concerns.push("integration");

  if (concerns.length >= 2) {
    return `This system shows overlapping ${concerns.join(", ")} signals. Memor leaves it unlabeled rather than forcing a misleading classification.`;
  }

  return null;
}

// ── Subsystem summary ─────────────────────────────────────────────────

function subsystemSummary(system: MemorSystem): string | null {
  const subs = system.subsystems;
  if (!subs?.length) return null;

  const versions = subs.filter((s) => s.kind === "api-version");
  if (versions.length >= 2) {
    const labels = versions.map((v) => v.name).sort().join(", ");
    return `This ${system.type.replace(/-/g, " ")} contains versioned API surfaces (${labels}).`;
  }
  if (versions.length === 1) {
    return `This API service includes a versioned surface at \`${versions[0].path}\`.`;
  }

  const features = subs.filter((s) => s.kind === "feature-area" || s.kind === "module");
  if (features.length >= 2) {
    return `Notable in-app areas include: ${features
      .map((f) => `\`${f.path}\``)
      .slice(0, 4)
      .join(", ")}.`;
  }
  if (features.length === 1) {
    return `Notable feature area: \`${features[0].path}\`.`;
  }

  const docs = subs.filter((s) => s.kind === "docs-section");
  if (docs.length) {
    return `Major documentation sections: ${docs.map((d) => d.name).join(", ")}.`;
  }

  const workers = subs.filter((s) => s.kind === "worker-surface");
  if (workers.length) {
    return `Worker-related areas: ${workers.map((w) => `\`${w.path}\``).join(", ")}.`;
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function cleanBaseDescription(raw: string): string {
  let d = raw.trim();
  d = d.replace(/\s*Candidate:\s*.*/s, "");
  d = d.replace(
    /Memor underclaimed this folder as "[^"]*":[^.]*\.\s*/,
    ""
  );
  d = d.replace(/Original hint:\s*\S+\.\s*/i, "");
  d = d.trim();
  if (d && !d.endsWith(".")) d += ".";
  return d;
}

function fallbackStartPathSentence(
  system: MemorSystem,
  mainUsedSupportRole: boolean
): string | null {
  if (system.startPathConfidence !== "fallback") return null;
  if (system.isRepoCenter) return null;

  if (!mainUsedSupportRole) {
    const sr = system.inferredSupportRole;
    if (sr) {
      const line = supportRoleSentence(sr, system);
      if (line) {
        return `Entry point is a fallback; ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
      }
    }
  }

  const blockLine = blockSemanticSentence(system);
  if (blockLine) {
    return `Entry point is a fallback; folder structure suggests ${blockLine.charAt(0).toLowerCase()}${blockLine.slice(1)}`;
  }

  return null;
}

// ── Main narrative builder ────────────────────────────────────────────

/**
 * Builds a human-readable description using strict priority:
 *   1. systemRoleHint (always influences when present)
 *   2. app archetype (runnable web apps)
 *   3. inferred support role (qualified with name purpose)
 *   4. package archetype (qualified with name purpose)
 *   5. block semantics (structural truth)
 *   6. informed fallback (name-derived → relaxed blocks → cleaned base)
 * Then appends mixed-signal note, fallback-start-path context,
 * and subsystem summary when applicable.
 */
export function enrichSystemDescription(
  baseDescription: string,
  system: MemorSystem,
  repoName?: string
): string {
  const chunks: string[] = [];

  const name = system.name;

  // Priority 1: Role hint (always influences when present)
  const roleHint = system.systemRoleHint;
  if (roleHint && roleHint !== "unknown") {
    const isGenericSupport = roleHint === "workflow-support-package";
    if (!isGenericSupport || !system.inferredSupportRole) {
      const roleLine = roleHintSentence(roleHint, system);
      if (roleLine) chunks.push(roleLine);
    }
  }

  // Priority 2: App archetype (for runnable web apps)
  if (!chunks.length) {
    const appArch = system.appArchetype;
    if (
      system.type === "web-app" &&
      system.runtimeRole === "runnable" &&
      appArch &&
      appArch !== "unknown"
    ) {
      const appLine = appArchetypeSentence(appArch, system);
      if (appLine) chunks.push(appLine);
    }
  }

  // Priority 2.3: Runnable web-app without archetype — still use type + tech
  if (!chunks.length && system.type === "web-app" && system.runtimeRole === "runnable") {
    const tech = system.detectedTech?.filter((t) => !/^(TypeScript|JavaScript)$/i.test(t));
    const techNote = tech && tech.length > 0 ? ` built with ${tech.slice(0, 2).join(", ")}` : "";
    const inc = system.connections?.incoming?.length || 0;
    const usedBy = inc > 0 ? ` — ${inc} module${inc > 1 ? "s" : ""} depend${inc === 1 ? "s" : ""} on it` : "";
    chunks.push(`${name} is the main web application${techNote}${usedBy}.`);
  }

  // Priority 2.5: package.json description (author-provided, high trust)
  if (!chunks.length && system.packageDescription) {
    chunks.push(`${name}: ${system.packageDescription}`);
  }

  // Priority 3: Inferred support role (qualified with connections)
  let mainUsedSupportRole = false;
  if (!chunks.length) {
    const sr = system.inferredSupportRole;
    if (sr) {
      const line = supportRoleSentence(sr, system);
      if (line) {
        chunks.push(line);
        mainUsedSupportRole = true;
      }
    }
  }

  // Priority 4: Package archetype (with connection counts)
  if (!chunks.length) {
    const pkgArch = system.packageArchetype;
    if (pkgArch && pkgArch !== "unknown") {
      const line = archetypeSentence(pkgArch, system);
      if (line) chunks.push(line);
    }
  }

  // Priority 5: Block semantics (structural truth, named)
  if (!chunks.length) {
    const blockLine = groundedBlockSentence(system);
    if (blockLine) chunks.push(blockLine);
  }

  // Priority 6: Informed fallback cascade
  const usedGenericFallback = !chunks.length;
  if (usedGenericFallback) {
    const purpose = deriveNamePurpose(system.name, repoName);
    const purposeUseful = purpose && purpose.length > 3 && purpose.toLowerCase() !== name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (purposeUseful) {
      const relaxed = relaxedBlockSentence(system);
      chunks.push(`${name} focuses on ${purpose}.${relaxed ? " " + relaxed : ""}`);
    } else {
      const relaxed = relaxedBlockSentence(system);
      if (relaxed) {
        chunks.push(`${name} ${relaxed.replace(/^It /, "").replace(/^This package /, "")}`);
      } else {
        const cleaned = cleanBaseDescription(baseDescription);
        if (cleaned) chunks.push(`${name}: ${cleaned}`);
      }
    }
  }

  // Append mixed-signal note when applicable (works alongside any priority)
  const mixed = mixedSignalSentence(system);
  if (mixed) chunks.push(mixed);

  // Append fallback-start-path grounding only when the main narrative
  // came from generic classifier or support role — not from archetype or role hint
  if (usedGenericFallback || mainUsedSupportRole) {
    const fbLine = fallbackStartPathSentence(system, mainUsedSupportRole);
    if (fbLine) chunks.push(fbLine);
  }

  // Append subsystem summary when available
  const subLine = subsystemSummary(system);
  if (subLine) chunks.push(subLine);

  return chunks.join(" ");
}
