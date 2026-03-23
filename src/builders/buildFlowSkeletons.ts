import type {
  AppArchetype,
  FlowSkeleton,
  FlowStep,
  MemorSystem,
  RepoMode,
  SystemType,
} from "../types";
import { evaluateStartPathQuality } from "./evaluateStartPathQuality";
import { slugify } from "../utils/text";

function steps(...s: FlowStep[]): FlowStep[] {
  return s;
}

function webAppShowsApiEvidence(system: MemorSystem): boolean {
  return system.blocks.some((b) =>
    ["api-layer", "services", "server-code", "integrations"].includes(b.type)
  );
}

function webAppArchetypeFlow(
  idBase: string,
  system: MemorSystem,
  archetype: AppArchetype
): FlowSkeleton[] {
  const start = system.recommendedStartPath;
  const apiOk = webAppShowsApiEvidence(system);

  const dataStep = (
    apiLabel: string,
    softLabel: string
  ): FlowStep =>
    apiOk
      ? { label: apiLabel, type: "api-call" as const }
      : {
          label: softLabel,
          type: "service" as const,
        };

  const templates: Partial<Record<AppArchetype, FlowSkeleton>> = {
    "marketing-site": {
      id: `${idBase}-flow-web-marketing`,
      name: "Visitor navigation (marketing surface)",
      description:
        "Typical path for a public site: navigation, page content, and optional backend or third-party calls.",
      confidence: 0.54,
      steps: steps(
        { label: "Visitor navigation (menus, links)", type: "ui" },
        {
          label: "Route / page resolves",
          type: "route",
          path: start,
        },
        { label: "Content or call-to-action surface renders", type: "ui" },
        {
          label:
            "Optional external, CMS, or backend interaction (heuristic)",
          type: "external",
        }
      ),
    },
    "docs-app": {
      id: `${idBase}-flow-web-docs`,
      name: "Documentation reading flow",
      description:
        "Reader-oriented path through docs routes and rendered reference content.",
      confidence: 0.55,
      steps: steps(
        { label: "Reader navigation (sidebar, search, links)", type: "ui" },
        {
          label: "Docs route resolves",
          type: "route",
          path: start,
        },
        { label: "Content rendering (MD/MDX or similar)", type: "ui" },
        { label: "Reference or example surface", type: "ui" }
      ),
    },
    "admin-app": {
      id: `${idBase}-flow-web-admin`,
      name: "Authenticated management flow",
      description:
        "Studio- or admin-style path: protected routes, management UI, then data or service interaction.",
      confidence: 0.54,
      steps: steps(
        {
          label: "Authenticated route or session gate",
          type: "route",
          path: start,
        },
        { label: "Dashboard or management UI", type: "ui" },
        dataStep(
          "API or server action for management data",
          "Data load or mutation (client or server; heuristic)"
        ),
        { label: "Backend service or data layer", type: "service" }
      ),
    },
    "component-showcase": {
      id: `${idBase}-flow-web-showcase`,
      name: "Component preview flow",
      description:
        "Design-system style path from example routes through preview surfaces to component modules.",
      confidence: 0.53,
      steps: steps(
        {
          label: "Component route or example page",
          type: "route",
          path: start,
        },
        { label: "Preview or render surface", type: "ui" },
        { label: "Component or pattern module", type: "ui" },
        {
          label: "Optional docs or example content",
          type: "ui",
        }
      ),
    },
    "learning-app": {
      id: `${idBase}-flow-web-learn`,
      name: "Learning content flow",
      description:
        "Tutorial- or course-style navigation through lessons and content surfaces.",
      confidence: 0.53,
      steps: steps(
        { label: "Learner navigation", type: "ui" },
        {
          label: "Lesson or guide route",
          type: "route",
          path: start,
        },
        { label: "Content or example surface", type: "ui" },
        dataStep(
          "Optional progress or API-backed state",
          "Optional progress or backend interaction (heuristic)"
        )
      ),
    },
    "product-app": {
      id: `${idBase}-flow-web-product`,
      name: "Product application flow",
      description:
        "Core product UI path from user action through feature surfaces to data interaction.",
      confidence: 0.55,
      steps: steps(
        { label: "User action", type: "ui" },
        {
          label: "Product route or page",
          type: "route",
          path: start,
        },
        { label: "Feature UI", type: "ui" },
        dataStep(
          "API call or explicit data interaction",
          "Data interaction (client or server; heuristic)"
        )
      ),
    },
  };

  const flow = templates[archetype];
  return flow ? [flow] : [];
}

/** True only when a runnable narrative is justified (not package.json fiction). */
function shouldEmitRunnableFlows(system: MemorSystem): boolean {
  if (system.runtimeRole !== "runnable") return false;
  const q = evaluateStartPathQuality(
    system.recommendedStartPath,
    system.type
  );
  if (q === "none" || q === "metadata-fallback") return false;
  const p = system.recommendedStartPath ?? "";
  if (p.endsWith("package.json") || p.endsWith("/package.json")) return false;
  return true;
}

function neutralSupportFlow(idBase: string): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-support`,
      name: "Tooling and configuration influence",
      description:
        "Host repo or tooling reads this package so builds, lint, types, or DX behave as intended — not a runtime app surface.",
      confidence: 0.42,
      steps: steps(
        {
          label: "Tooling or host reads configuration / metadata",
          type: "config",
        },
        {
          label: "Config shapes build, lint, typecheck, or editor behavior",
          type: "config",
        },
        {
          label: "Downstream packages inherit those constraints",
          type: "unknown",
        }
      ),
    },
  ];
}

function neutralMetadataFlow(idBase: string): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-metadata`,
      name: "Package metadata and consumption",
      description:
        "Memor did not find a clear source entry; rely on package.json exports, scripts, and dependents.",
      confidence: 0.38,
      steps: steps(
        {
          label: "package.json declares exports, scripts, and dependencies",
          type: "config",
        },
        {
          label: "Host systems or tooling resolve the package by name",
          type: "config",
        },
        {
          label: "Behavior appears when imported or invoked from a parent workspace",
          type: "service",
        }
      ),
    },
  ];
}

function neutralConsumableUiFlow(
  idBase: string,
  pathHint?: string
): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-consume-ui`,
      name: "Library consumption",
      description:
        "A UI-oriented package: hosts import it; rendering happens in the host application.",
      confidence: 0.48,
      steps: steps(
        { label: "Host application imports this package", type: "config" },
        {
          label: "Package exposes components or utilities (barrels / exports)",
          type: "config",
          path: pathHint,
        },
        { label: "Host renders or calls into the exported surface", type: "ui" }
      ),
    },
  ];
}

function neutralConsumableFeatureFlow(
  idBase: string,
  pathHint?: string
): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-consume-feature`,
      name: "Feature / domain module usage",
      description:
        "Shared logic consumed by apps or services — execution context comes from the host.",
      confidence: 0.46,
      steps: steps(
        { label: "Host system imports this feature module", type: "config" },
        {
          label: "Feature logic runs in the host’s process / request",
          type: "service",
          path: pathHint,
        },
        {
          label: "Results return to the host caller or pipeline",
          type: "service",
        }
      ),
    },
  ];
}

function neutralExplorationFlow(
  idBase: string,
  pathHint?: string
): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-explore`,
      name: "Exploration skeleton",
      description:
        "Weak automatic signal — use blocks and entry list below before assuming a runnable app or API.",
      confidence: 0.32,
      steps: steps(
        {
          label: "Open the suggested path or package metadata first",
          type: "config",
          path: pathHint,
        },
        { label: "Trace imports from consuming workspaces", type: "unknown" },
        { label: "Confirm with tests, scripts, or runtime", type: "external" }
      ),
    },
  ];
}

function neutralFlows(system: MemorSystem, idBase: string): FlowSkeleton[] {
  const q = evaluateStartPathQuality(
    system.recommendedStartPath,
    system.type
  );
  const hint = system.recommendedStartPath;

  if (system.runtimeRole === "support") return neutralSupportFlow(idBase);

  /** Downgraded or weak-entry “runnable” types: avoid fake browser/API certainty */
  if (
    system.runtimeRole === "consumable" &&
    (system.type === "web-app" ||
      system.type === "api-service" ||
      system.type === "docs-site" ||
      system.type === "worker")
  ) {
    return neutralExplorationFlow(idBase, hint);
  }

  if (q === "metadata-fallback" || q === "none")
    return neutralMetadataFlow(idBase);

  if (system.type === "ui-library")
    return neutralConsumableUiFlow(idBase, hint);

  if (
    system.type === "shared-package" ||
    system.type === "unknown" ||
    system.runtimeRole === "consumable"
  ) {
    if (
      system.type === "shared-package" &&
      /ui|component|design|prisma|db|database|feature|domain|platform/i.test(
        system.name
      )
    ) {
      if (/ui|component|design/i.test(system.name))
        return neutralConsumableUiFlow(idBase, hint);
      return neutralConsumableFeatureFlow(idBase, hint);
    }
    return neutralConsumableFeatureFlow(idBase, hint);
  }

  if (system.type === "infra")
    return [
      {
        id: `${idBase}-flow-infra-neutral`,
        name: "Infrastructure layout",
        description:
          "Operational assets without a clear single process entry in this scan.",
        confidence: 0.4,
        steps: steps(
          { label: "Manifests define deploy targets", type: "config" },
          { label: "Pipelines or operators apply them", type: "external" }
        ),
      },
    ];

  return neutralExplorationFlow(idBase, hint);
}

function workflowPlatformCoreFlow(
  idBase: string,
  system: MemorSystem
): FlowSkeleton[] {
  return [
    {
      id: `${idBase}-flow-wf-core`,
      name: "Workflow orchestration core",
      description:
        "High-level lifecycle of this workflow platform module — from task definition through scheduling to execution.",
      confidence: 0.52,
      steps: steps(
        {
          label: "Task or DAG definition (declarative or code)",
          type: "config",
        },
        {
          label: "Scheduler evaluates readiness and dependencies",
          type: "service",
        },
        {
          label: "Executor dispatches work to workers or processes",
          type: "service",
        },
        {
          label: "Operator or task logic runs (providers, hooks, connections)",
          type: "external",
        },
        { label: "Results and state persisted", type: "db" }
      ),
    },
  ];
}

function frameworkCoreFlow(
  idBase: string,
  system: MemorSystem
): FlowSkeleton[] {
  const hint = system.recommendedStartPath;
  return [
    {
      id: `${idBase}-flow-fw-core`,
      name: "Framework package consumption",
      description:
        "This package is imported and used by host applications — it does not run independently.",
      confidence: 0.5,
      steps: steps(
        {
          label: "Host application or framework consumer imports this package",
          type: "config",
          path: hint,
        },
        {
          label: "Package exports runtime, utilities, or extension points",
          type: "service",
        },
        {
          label:
            "Behavior materializes in the host's process (render, middleware, runtime, etc.)",
          type: "service",
        }
      ),
    },
  ];
}

/**
 * Runnable HTTP/browser/worker narratives only when runtime role and start-path quality allow it.
 */
export function buildFlowSkeletons(
  system: MemorSystem,
  repoMode?: RepoMode
): FlowSkeleton[] {
  const idBase = slugify(system.id || system.name);
  const t: SystemType = system.type;

  if (
    repoMode === "workflow-platform" &&
    system.systemTier === "primary"
  ) {
    return workflowPlatformCoreFlow(idBase, system);
  }

  if (
    repoMode === "framework-core" &&
    system.systemTier === "primary"
  ) {
    return frameworkCoreFlow(idBase, system);
  }

  if (!shouldEmitRunnableFlows(system)) {
    return neutralFlows(system, idBase);
  }

  if (t === "web-app") {
    const arch = system.appArchetype;
    if (arch && arch !== "unknown") {
      const specialized = webAppArchetypeFlow(idBase, system, arch);
      if (specialized.length) return specialized;
    }

    const apiOk = webAppShowsApiEvidence(system);
    return [
      {
        id: `${idBase}-flow-web`,
        name: "Typical web request path",
        description:
          "High-level path from user interaction through UI to backend calls (heuristic template).",
        confidence: 0.55,
        steps: steps(
          { label: "User action in browser", type: "ui" },
          {
            label: "Route / page resolves",
            type: "route",
            path: system.recommendedStartPath,
          },
          { label: "UI components render & handle events", type: "ui" },
          apiOk
            ? {
                label: "Client fetches data (API / server action)",
                type: "api-call" as const,
              }
            : {
                label: "Data or configuration load (client or server; heuristic)",
                type: "service" as const,
              },
          { label: "Backend or external services respond", type: "service" }
        ),
      },
    ];
  }

  if (t === "api-service") {
    return [
      {
        id: `${idBase}-flow-api`,
        name: "Typical API request",
        description:
          "Request lifecycle from HTTP entry through application logic to persistence.",
        confidence: 0.58,
        steps: steps(
          { label: "Inbound HTTP request", type: "route" },
          { label: "Router / controller dispatches", type: "route" },
          { label: "Service or domain logic runs", type: "service" },
          { label: "Database or external integration", type: "db" }
        ),
      },
    ];
  }

  if (t === "docs-site") {
    return [
      {
        id: `${idBase}-flow-docs`,
        name: "Documentation navigation",
        description:
          "Reader flow from navigation to rendered documentation content.",
        confidence: 0.54,
        steps: steps(
          { label: "User navigates site", type: "ui" },
          { label: "Docs route / sidebar resolves", type: "route" },
          { label: "MD/MDX content renders", type: "ui" }
        ),
      },
    ];
  }

  if (t === "worker") {
    return [
      {
        id: `${idBase}-flow-worker`,
        name: "Background job flow",
        description:
          "Trigger-driven processing typical of workers and queues.",
        confidence: 0.5,
        steps: steps(
          { label: "Trigger (schedule, queue, or event)", type: "external" },
          { label: "Worker process picks up job", type: "service" },
          { label: "Business logic / service calls", type: "service" },
          { label: "Database or external API", type: "db" }
        ),
      },
    ];
  }

  return neutralFlows(system, idBase);
}
