import * as path from "path";
import type { BlockType, FlatScanEntry, SystemBlock } from "../types";
import { slugify } from "../utils/text";
import { toPosix } from "../utils/path";

type FolderRule = {
  names: string[];
  type: BlockType;
  displayName: string;
  reason: string;
};

/** First matching rule wins; list specific names before generic ones. */
const RULES: FolderRule[] = [
  {
    names: ["migrations", "migration"],
    type: "database-migrations",
    displayName: "Database migrations",
    reason: "Folder name suggests schema migration history.",
  },
  {
    names: ["i18n", "locales", "locale", "translations", "intl", "l10n"],
    type: "localization",
    displayName: "Localization",
    reason: "Typical location for locale strings and i18n assets.",
  },
  {
    names: ["typings", "typedefs"],
    type: "type-definitions",
    displayName: "Type definitions",
    reason: "Shared TypeScript or declaration-style types.",
  },
  {
    names: ["types"],
    type: "type-definitions",
    displayName: "Type definitions",
    reason: "Often shared types and interfaces (heuristic).",
  },
  {
    names: ["examples", "example", "demo", "demos"],
    type: "examples",
    displayName: "Examples",
    reason: "Sample or demo code for consumers.",
  },
  {
    names: ["utils", "util"],
    type: "utilities",
    displayName: "Utilities",
    reason: "Small shared helpers and pure functions.",
  },
  {
    names: ["constants", "const"],
    type: "constants",
    displayName: "Constants",
    reason: "Named constants and static configuration values.",
  },
  {
    names: ["templates"],
    type: "templates",
    displayName: "Templates",
    reason: "Email, HTML, or other reusable templates.",
  },
  {
    names: ["hooks"],
    type: "hooks",
    displayName: "Hooks",
    reason: "React-style hooks or similar composable logic.",
  },
  {
    names: ["generated", "gen"],
    type: "generated-code",
    displayName: "Generated code",
    reason: "Likely build- or codegen-output (heuristic).",
  },
  {
    names: ["public", "static"],
    type: "static-assets",
    displayName: "Static assets",
    reason: "Public files served as-is (images, fonts, etc.).",
  },
  {
    names: ["assets"],
    type: "static-assets",
    displayName: "Static assets",
    reason: "Bundled or referenced static files.",
  },
  {
    names: ["mocks", "mock", "__mocks__"],
    type: "mocks",
    displayName: "Mocks",
    reason: "Test doubles or stub implementations.",
  },
  {
    names: ["tests", "test", "__tests__", "e2e"],
    type: "tests",
    displayName: "Tests",
    reason: "Automated test code.",
  },
  {
    names: ["scripts"],
    type: "scripts",
    displayName: "Scripts",
    reason: "Build, dev, or one-off scripts.",
  },
  {
    names: ["cli"],
    type: "cli",
    displayName: "CLI",
    reason: "Command-line entry or tooling for this package.",
  },
  {
    names: ["server"],
    type: "server-code",
    displayName: "Server code",
    reason: "Server-only modules (heuristic by folder name).",
  },
  {
    names: ["client"],
    type: "client-code",
    displayName: "Client code",
    reason: "Browser or client-only modules (heuristic).",
  },
  {
    names: ["email", "emails"],
    type: "email-module",
    displayName: "Email",
    reason: "Email templates or mail-sending helpers.",
  },
  {
    names: ["widgets"],
    type: "embeddable-components",
    displayName: "Embeddable components",
    reason: "Often widget- or embed-style UI pieces.",
  },
  {
    names: ["src"],
    type: "source-tree",
    displayName: "Source tree",
    reason: "Primary implementation root for this system.",
  },
  {
    names: ["app", "pages", "routes", "routing", "screens"],
    type: "routes",
    displayName: "Routes",
    reason: "Folder name commonly holds application routes or screens.",
  },
  {
    names: ["components", "ui", "elements"],
    type: "ui-components",
    displayName: "UI Components",
    reason: "Typical presentational or reusable UI building blocks.",
  },
  {
    names: ["features", "modules", "domains"],
    type: "features",
    displayName: "Features",
    reason: "Often vertical slices or domain-oriented code.",
  },
  {
    names: ["store", "state", "redux", "zustand", "jotai", "recoil"],
    type: "state",
    displayName: "State",
    reason: "Naming suggests client or shared state management.",
  },
  {
    names: ["api", "apis", "trpc", "graphql", "queries"],
    type: "api-layer",
    displayName: "API Layer",
    reason: "HTTP/RPC client or server API surface (heuristic).",
  },
  {
    names: ["lib"],
    type: "library-code",
    displayName: "Library code",
    reason: "Shared internal modules and helpers (name-based).",
  },
  {
    names: ["services", "use-cases", "usecases", "application"],
    type: "services",
    displayName: "Services",
    reason: "Often orchestrates domain logic or external calls.",
  },
  {
    names: ["db", "database", "prisma", "drizzle", "models", "entities"],
    type: "database",
    displayName: "Database",
    reason: "Suggests persistence, ORM, or schema definitions.",
  },
  {
    names: ["providers", "provider"],
    type: "providers",
    displayName: "Providers",
    reason: "Provider or connector modules (ecosystem extensions).",
  },
  {
    names: ["operators", "operator"],
    type: "operators",
    displayName: "Operators",
    reason: "Operator definitions for workflow or orchestration systems.",
  },
  {
    names: ["workflows", "workflow", "dags"],
    type: "workflows",
    displayName: "Workflows",
    reason: "Workflow, DAG, or pipeline definitions.",
  },
  {
    names: ["tasks", "task", "jobs"],
    type: "tasks",
    displayName: "Tasks",
    reason: "Task or job definitions for asynchronous processing.",
  },
  {
    names: ["plugins", "plugin", "extensions"],
    type: "plugins",
    displayName: "Plugins",
    reason: "Plugin or extension modules.",
  },
  {
    names: ["adapters", "adapter"],
    type: "adapters",
    displayName: "Adapters",
    reason: "Adapter layer for protocol or runtime binding.",
  },
  {
    names: ["transport", "transports"],
    type: "transport",
    displayName: "Transport",
    reason: "Network or messaging transport layer.",
  },
  {
    names: ["scheduler", "executor", "orchestration", "orchestrator"],
    type: "orchestration",
    displayName: "Orchestration",
    reason: "Scheduling, execution, or orchestration logic.",
  },
  {
    names: ["sdk", "sdks"],
    type: "sdks",
    displayName: "SDKs",
    reason: "Software development kit or client library surface.",
  },
  {
    names: ["integrations"],
    type: "integrations",
    displayName: "Integrations",
    reason: "Third-party adapters or outbound integrations.",
  },
  {
    names: ["clients", "client"],
    type: "integrations",
    displayName: "Clients",
    reason: "Client modules for external service communication.",
  },
  {
    names: ["schemas", "validators", "validation", "zod", "dto"],
    type: "schemas",
    displayName: "Schemas",
    reason: "Types, validation, or DTO-style definitions.",
  },
  {
    names: ["docs", "documentation", "content"],
    type: "docs",
    displayName: "Docs",
    reason: "Written documentation or long-form content.",
  },
  {
    names: ["config", "configuration", "settings", "env"],
    type: "config",
    displayName: "Config",
    reason: "Environment or build/runtime configuration.",
  },
];

function matchRule(dirName: string): FolderRule | undefined {
  const lower = dirName.toLowerCase();
  for (const rule of RULES) {
    if (rule.names.includes(lower)) return rule;
  }
  return undefined;
}

/**
 * Maps first-level directories under the system root to architectural blocks.
 */
export function detectBlocks(
  systemRoot: string,
  systemRootRelative: string,
  flatIndex: FlatScanEntry[],
  systemId: string
): SystemBlock[] {
  const norm = path.normalize(systemRoot);
  const blocks: SystemBlock[] = [];
  let counter = 0;

  const directChildDirs = flatIndex.filter((e) => {
    if (!e.isDirectory) return false;
    const fp = path.normalize(e.fullPath);
    const parent = path.dirname(fp);
    return parent === norm;
  });

  for (const dir of directChildDirs) {
    const rule = matchRule(dir.name);
    if (!rule) continue;

    const rel =
      systemRootRelative === "."
        ? toPosix(dir.relativePath)
        : toPosix(path.join(systemRootRelative, dir.name));

    blocks.push({
      id: `${systemId}-block-${slugify(dir.name)}-${counter++}`,
      name: rule.displayName,
      type: rule.type,
      path: rel,
      reason: rule.reason,
    });
  }

  if (blocks.length === 0) {
    for (const dir of directChildDirs.slice(0, 12)) {
      const rel =
        systemRootRelative === "."
          ? toPosix(dir.relativePath)
          : toPosix(path.join(systemRootRelative, dir.name));
      blocks.push({
        id: `${systemId}-block-${slugify(dir.name)}-${counter++}`,
        name: dir.name,
        type: "unknown",
        path: rel,
        reason:
          "No strong convention match; included as a top-level folder for orientation.",
      });
    }
  }

  return blocks.slice(0, 16);
}
