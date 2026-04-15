import type { MemorSystem, RepoAnalysis, FlowDerivation } from "../types";
import type { DetectedRoute } from "../scanner/detectRoutes";
import type { RepoZone, RepoStory } from "./generateRepoStory";

// ── Flow types ────────────────────────────────────────────────────────

export type FlowStep = {
  label: string;
  systemName?: string;
  zoneName?: string;
  description: string;
  /** Evidence anchor: relative file path where this step was detected */
  evidenceFile?: string;
  /** 1-based line number of the evidence */
  evidenceLine?: number;
  /** Detected handler/function name */
  handlerName?: string;
  /** @deprecated Interpretive narration — never rendered. Will be removed. */
  whyItMatters?: string;
};

export type RepoFlow = {
  id: string;
  title: string;
  steps: FlowStep[];
  confidence: "high" | "medium" | "low";
  type: "runtime" | "build" | "dev" | "content" | "rendering";
  isMain?: boolean;
  /**
   * "evidence" = steps derived from real detected routes/calls (file+line anchored).
   * "pattern"  = steps assembled from structural heuristics (no specific code evidence).
   * Absent = "pattern" (legacy flows not yet migrated).
   */
  derivedFrom?: FlowDerivation;
};

// ── Flow families ─────────────────────────────────────────────────────

type FlowFamily =
  | "web-product"
  | "frontend-framework"
  | "backend-framework"
  | "library"
  | "cli-tool";

function inferFlowFamilies(
  repoMode: string,
  systems: MemorSystem[],
  zones: RepoZone[]
): Set<FlowFamily> {
  const families = new Set<FlowFamily>();

  const hasWebApp = systems.some((s) => s.type === "web-app");
  const hasApiService = systems.some(
    (s) => s.type === "api-service" || /\bapi\b|trpc|graphql/i.test(s.name)
  );
  const hasPlatformAdapters = systems.some((s) =>
    /platform[-.]?(express|fastify|koa|hapi|socket)/i.test(s.name)
  );
  const hasRenderers = zones.some((z) =>
    /renderer|binding|dom|native/i.test(z.name)
  );
  const hasCoreRuntime = zones.some((z) =>
    /core.*runtime|^runtime$/i.test(z.name)
  );

  const webProductModes = [
    "product-web-app",
    "product-domain-machine",
    "monorepo-app",
  ];
  if (webProductModes.includes(repoMode) || (hasWebApp && hasApiService)) {
    families.add("web-product");
  }

  if (repoMode === "framework-core") {
    if (hasRenderers || hasCoreRuntime) {
      families.add("frontend-framework");
    }
    if (hasPlatformAdapters) {
      families.add("backend-framework");
    }
    if (!hasRenderers && !hasCoreRuntime && !hasPlatformAdapters) {
      families.add("frontend-framework");
    }
  }

  const primaryCount = systems.filter(
    (s) => s.systemTier === "primary"
  ).length;
  const primarySys = systems.find((s) => s.systemTier === "primary");
  // Library family: only fires for actual library/package repos.
  // "unknown" mode alone is not enough — infra, test suites, and docs should NOT get "Import X" flows.
  const libraryModes = ["library-tooling", "library"];
  const primaryLooksLikeLibrary =
    primarySys?.systemRoleHint === "primary-library-package" ||
    primarySys?.type === "ui-library" ||
    (primarySys?.type === "shared-package" && (primarySys.connections?.incoming?.length || 0) > 0);
  if (libraryModes.includes(repoMode) || (primaryLooksLikeLibrary && primaryCount <= 2 && !hasWebApp)) {
    families.add("library");
  }

  if (systems.some((s) => /^create-|^cli$/i.test(s.name))) {
    families.add("cli-tool");
  }

  return families;
}

// ── Pattern context ───────────────────────────────────────────────────

type PatternCtx = {
  systems: MemorSystem[];
  zones: RepoZone[];
  center: MemorSystem | undefined;
  centerName: string;
  repoMode: string;
  families: Set<FlowFamily>;
  zoneNames: Set<string>;
  sysNames: Set<string>;
  hasZone: (name: string) => boolean;
  findZone: (pattern: RegExp) => RepoZone | undefined;
  hasSys: (pattern: RegExp) => boolean;
  findSys: (pattern: RegExp) => MemorSystem | undefined;
  findSysByType: (type: string) => MemorSystem[];
};

type FlowPattern = {
  id: string;
  match: (ctx: PatternCtx) => boolean;
  build: (ctx: PatternCtx) => RepoFlow;
};

// ── Helpers ───────────────────────────────────────────────────────────


function topConnected(sys: MemorSystem, dir: "outgoing" | "incoming", max = 3): string[] {
  return (sys.connections?.[dir] || []).slice(0, max).map((c) => c.targetSystemName);
}

// ── Flow patterns ─────────────────────────────────────────────────────

const FLOW_PATTERNS: FlowPattern[] = [

  // ═══════════════════════════════════════════════════════════════════
  // WEB PRODUCT FAMILY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "web-user-journey",
    match: (ctx) =>
      ctx.families.has("web-product") &&
      (!!ctx.findZone(/marketing|public|landing/i) ||
       !!ctx.findZone(/dashboard|product.*surface/i) ||
       ctx.findSysByType("web-app").length > 0),
    build: (ctx) => {
      const steps: FlowStep[] = [];

      const publicZone = ctx.findZone(/marketing|public|landing/i);
      if (publicZone) {
        steps.push({
          label: "Visit public surface",
          zoneName: publicZone.name,
          description: `User arrives at the public-facing pages (${(publicZone.systemNames || []).slice(0, 3).join(", ")}).`,
          whyItMatters: "This is the first thing users see — acquisition and first impressions happen here",
        });
      }

      const authZone = ctx.findZone(/auth|onboarding|login|signup/i);
      if (authZone) {
        steps.push({
          label: "Authenticate / onboard",
          zoneName: authZone.name,
          description: "User signs up, logs in, or completes onboarding flow.",
          whyItMatters: "Gates access to the product — every user passes through this",
        });
      }

      const dashZone = ctx.findZone(/dashboard|product.*surface|app.*surface/i);
      if (dashZone) {
        steps.push({
          label: "Enter product dashboard",
          zoneName: dashZone.name,
          description: `User accesses core product workflows (${(dashZone.systemNames || []).slice(0, 3).join(", ")}).`,
          whyItMatters: "Where users spend most of their time — core product value lives here",
        });
      }

      if (steps.length < 2) {
        const webApps = ctx.findSysByType("web-app");
        const mainApp = webApps.find((s) => s.systemTier === "primary") || webApps[0];
        if (mainApp) {
          steps.push({
            label: `Enter ${mainApp.name}`,
            systemName: mainApp.name,
            description: `User accesses the main web application.`,
            whyItMatters: "The primary interface users interact with",
          });
        }
        const featureSys = ctx.systems.find(
          (s) => /feature/i.test(s.name) && s.type === "shared-package"
        );
        if (featureSys) {
          steps.push({
            label: "Navigate to features",
            systemName: featureSys.name,
            description: `Feature modules (${featureSys.name}) power the core product workflows.`,
            whyItMatters: "Where business logic meets the user — domain-specific functionality lives here",
          });
        }
      }

      if (steps.length < 2) return { id: "web-user-journey", title: "User journey", steps: [], confidence: "low" as const, type: "runtime" as const };

      return {
        id: "web-user-journey",
        title: "User journey",
        steps,
        confidence: steps.length >= 3 ? "high" : "medium",
        type: "runtime",
      };
    },
  },

  {
    id: "web-data-flow",
    match: (ctx) => {
      if (!ctx.families.has("web-product")) return false;
      const hasApi = !!ctx.findZone(/api|bff|server.*route/i) ||
        ctx.findSysByType("api-service").length > 0 ||
        ctx.systems.some((s) => /\bapi\b|trpc|graphql/i.test(s.name) && s.type === "shared-package");
      return hasApi;
    },
    build: (ctx) => {
      const webApps = ctx.findSysByType("web-app");
      const mainApp = webApps.find((s) => s.systemTier === "primary") || webApps[0];
      const apiZone = ctx.findZone(/api|bff|server.*route/i);
      const apiSys = ctx.findSysByType("api-service")[0] ||
        ctx.systems.find((s) => /\bapi\b|trpc/i.test(s.name) && s.type === "shared-package");
      const dataZone = ctx.findZone(/data|lib.*layer|service/i);
      const dataSys = ctx.systems.find((s) => /prisma|db|database|kysely|drizzle/i.test(s.name));
      const libSys = ctx.systems.find((s) => s.name === "lib" && s.systemTier === "primary");
      const uiZone = ctx.findZone(/shared.*component|ui.*component/i);

      const steps: FlowStep[] = [];

      steps.push({
        label: "User action triggers request",
        systemName: mainApp?.name,
        zoneName: !mainApp ? undefined : undefined,
        description: `A user interaction in ${mainApp?.name || "the UI"} triggers a data request.`,
        whyItMatters: "Every data flow starts with user intent — this is the trigger point",
      });

      if (apiZone || apiSys) {
        const name = apiSys?.name || apiZone?.name || "API";
        steps.push({
          label: `${name} handles request`,
          systemName: apiSys?.name,
          zoneName: apiZone?.name,
          description: `Request is handled by the API layer${apiSys ? ` (${apiSys.name})` : ""} — routing, auth, and validation.`,
          whyItMatters: "Central control point — auth, validation, and business logic converge here",
        });
      }

      if (libSys || dataZone) {
        const name = libSys?.name || dataZone?.name || "lib";
        steps.push({
          label: `Process through ${name}`,
          systemName: libSys?.name,
          zoneName: dataZone?.name,
          description: `Shared domain logic and services (${name}) process the request.`,
          whyItMatters: "Where raw data becomes meaningful — domain rules and business logic",
        });
      }

      if (dataSys) {
        steps.push({
          label: `Data access via ${dataSys.name}`,
          systemName: dataSys.name,
          description: `${dataSys.name} handles database operations and data persistence.`,
          whyItMatters: "The source of truth — all persistent state flows through here",
        });
      }

      steps.push({
        label: "Render response",
        systemName: mainApp?.name,
        zoneName: uiZone?.name,
        description: "Data flows back to the UI where components render the result.",
        whyItMatters: "The user sees the result — the whole flow exists to serve this moment",
      });

      return {
        id: "web-data-flow",
        title: "Data request flow",
        steps,
        confidence: steps.length >= 4 ? "high" : "medium",
        type: "runtime",
      };
    },
  },

  {
    id: "web-dev-loop",
    match: (ctx) => ctx.families.has("web-product"),
    build: (ctx) => {
      const webApps = ctx.findSysByType("web-app");
      const mainApp = webApps.find((s) => s.systemTier === "primary") || webApps[0];
      const appName = mainApp?.name || ctx.centerName;
      return {
        id: "web-dev-loop",
        title: "Development loop",
        steps: [
          {
            label: "Edit source files",
            systemName: appName,
            description: `Developer modifies pages, components, or modules in ${appName}.`,
            whyItMatters: "Where developer intent enters the system",
          },
          {
            label: "Dev server processes changes",
            systemName: appName,
            description: "The framework dev server detects changes and recompiles affected modules.",
            whyItMatters: "Fast feedback is critical — this determines development velocity",
          },
          {
            label: "Hot reload in browser",
            systemName: appName,
            description: "Updated UI is reflected in the browser without full page refresh.",
            whyItMatters: "Instant visual confirmation that the change works as intended",
          },
        ],
        confidence: "medium" as const,
        type: "dev" as const,
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // FRONTEND FRAMEWORK FAMILY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "framework-runtime",
    match: (ctx) =>
      ctx.families.has("frontend-framework") &&
      !!ctx.findZone(/core|runtime|scheduler/i) &&
      !!ctx.findZone(/renderer|binding|dom|native/i),
    build: (ctx) => {
      const coreZone = ctx.findZone(/core|runtime|scheduler/i)!;
      const rendererZone = ctx.findZone(/renderer|binding|dom|native/i)!;
      const coreMembers = (coreZone.systemNames || []).slice(0, 3);
      const renderers = (rendererZone.systemNames || []).slice(0, 3);
      return {
        id: "framework-runtime",
        title: "Runtime flow",
        steps: [
          {
            label: `Import ${ctx.centerName}`,
            systemName: ctx.centerName,
            description: `Application code imports the public API from ${ctx.centerName}.`,
            whyItMatters: "The single entry point consumers interact with — everything starts here",
          },
          {
            label: "Renderer entry",
            zoneName: rendererZone.name,
            description: `A renderer (${renderers.join(", ")}) connects the framework to a target environment.`,
            whyItMatters: "Determines where output goes — browser DOM, native UI, or server stream",
          },
          {
            label: "Schedule & reconcile",
            zoneName: coreZone.name,
            description: `Work is scheduled and reconciled through core packages (${coreMembers.join(", ")}).`,
            whyItMatters: "The heart of the framework — decides what changes and when",
          },
          {
            label: "Commit to host",
            zoneName: rendererZone.name,
            description: "Reconciled changes are committed to the host environment.",
            whyItMatters: "Where virtual representations become real — the user-visible result",
          },
        ],
        confidence: "high",
        type: "runtime",
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // BACKEND FRAMEWORK FAMILY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "backend-request-pipeline",
    match: (ctx) => ctx.families.has("backend-framework"),
    build: (ctx) => {
      const platformSystems = ctx.systems.filter((s) =>
        /platform[-.]?(express|fastify|koa|hapi|socket)/i.test(s.name)
      );
      const platformNames = platformSystems.slice(0, 2).map((s) => s.name);
      const coreSys = ctx.center || ctx.systems.find((s) => s.name === "core");
      const commonSys = ctx.systems.find((s) => /common|shared/i.test(s.name) && s.systemTier === "primary");
      const microSys = ctx.systems.find((s) => /microservice/i.test(s.name));

      const steps: FlowStep[] = [
        {
          label: "HTTP request arrives",
          systemName: platformNames[0],
          description: `An incoming request enters through a platform adapter (${platformNames.join(" or ")}).`,
          whyItMatters: "The entry point — platform adapters abstract away Express/Fastify differences",
        },
      ];

      if (commonSys) {
        steps.push({
          label: "Middleware, guards & pipes",
          systemName: commonSys.name,
          description: `Common decorators and utilities (${commonSys.name}) handle validation, auth, and transformation.`,
          whyItMatters: "Cross-cutting concerns — auth checks, input validation, and data transformation happen here",
        });
      }

      steps.push({
        label: "Route to controller & resolve dependencies",
        systemName: coreSys?.name || "core",
        description: `The core module system (${coreSys?.name || "core"}) matches the route, resolves dependencies via DI, and invokes the handler.`,
        whyItMatters: "The architectural center — dependency injection and module orchestration happen here",
      });

      steps.push({
        label: "Execute business logic",
        description: "The controller delegates to service providers which execute domain logic.",
        whyItMatters: "Where the actual work happens — business rules, data access, and external calls",
      });

      if (microSys) {
        steps.push({
          label: "Optional: message transport",
          systemName: microSys.name,
          description: `For distributed systems, ${microSys.name} handles inter-service communication via message patterns.`,
          whyItMatters: "Enables scaling beyond a single process — microservices communicate through transports",
        });
      }

      steps.push({
        label: "Serialize & send response",
        systemName: platformNames[0],
        description: "Response is serialized through interceptors and sent back through the platform adapter.",
        whyItMatters: "The last mile — response transformation, caching, and serialization before the client receives it",
      });

      return {
        id: "backend-request-pipeline",
        title: "Request lifecycle",
        steps,
        confidence: "high",
        type: "runtime",
      };
    },
  },

  {
    id: "backend-module-system",
    match: (ctx) =>
      ctx.families.has("backend-framework") &&
      !!ctx.center &&
      (ctx.center.connections?.incoming?.length || 0) >= 3,
    build: (ctx) => {
      const coreSys = ctx.center!;
      const dependents = topConnected(coreSys, "incoming", 4);

      return {
        id: "backend-module-system",
        title: "Module & DI system",
        steps: [
          {
            label: "Define module with decorators",
            systemName: coreSys.name,
            description: `Developers use @Module, @Controller, @Injectable decorators to structure the application.`,
            whyItMatters: "Declarative architecture — decorators define the app's structure at a glance",
          },
          {
            label: "Register providers in DI container",
            systemName: coreSys.name,
            description: `${coreSys.name} builds a dependency graph and resolves all injectable providers.`,
            whyItMatters: "Automatic dependency resolution — no manual wiring, just declare and inject",
          },
          {
            label: "Platform packages extend capabilities",
            description: `Modules like ${dependents.join(", ")} plug into core to add platform-specific features.`,
            whyItMatters: "Each module adds a capability without the others needing to know about it",
          },
          {
            label: "Application bootstraps",
            description: "All modules are loaded, providers resolved, and the app starts listening.",
            whyItMatters: "The moment everything comes together — DI graph is complete, routes are bound",
          },
        ],
        confidence: "medium",
        type: "runtime",
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // LIBRARY FAMILY
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "library-api-flow",
    match: (ctx) =>
      ctx.families.has("library") && !!ctx.center,
    build: (ctx) => {
      const center = ctx.center!;
      const consumers = topConnected(center, "incoming", 4);
      const deps = topConnected(center, "outgoing", 3);
      const supportSystems = ctx.systems.filter(
        (s) => s.systemTier === "support" && s.type !== "support-system"
      );
      const toolingSystems = supportSystems.filter((s) =>
        /codegen|codemod|cli|tool/i.test(s.name)
      );
      const extensionSystems = supportSystems.filter(
        (s) => !toolingSystems.includes(s) && s.type === "shared-package"
      );

      const steps: FlowStep[] = [
        {
          label: `Import ${center.name}`,
          systemName: center.name,
          description: `Consumer application imports the public API from ${center.name}.${center.description ? " " + center.description.split(".")[0] + "." : ""}`,
          whyItMatters: "The primary contract between the library and its users — API stability is critical here",
        },
      ];

      if (deps.length > 0) {
        steps.push({
          label: "Internal processing",
          description: `Under the hood, ${center.name} orchestrates through ${deps.join(", ")}.`,
          whyItMatters: "Implementation details consumers don't see but that power the library's behavior",
        });
      }

      if (extensionSystems.length > 0) {
        const names = extensionSystems.slice(0, 3).map((s) => s.name);
        steps.push({
          label: "Extension packages",
          description: `Additional packages (${names.join(", ")}) extend ${center.name} with specialized functionality.`,
          whyItMatters: "Optional power — consumers pick only what they need",
        });
      }

      if (toolingSystems.length > 0) {
        const names = toolingSystems.slice(0, 3).map((s) => s.name);
        steps.push({
          label: "Developer tooling",
          description: `Supporting tools (${names.join(", ")}) help with code generation, migration, or debugging.`,
          whyItMatters: "Reduces friction for adoption and upgrades",
        });
      }

      // Synthesize a middle step if we couldn't build one from connections.
      // This ensures the flow is useful even for single-package libraries with no
      // system-to-system connections yet detected.
      if (steps.length < 3) {
        if (center.type === "api-service") {
          // Backend framework / HTTP library (e.g., express, koa, fastify)
          steps.splice(1, 0, {
            label: "Route matching & middleware",
            systemName: center.name,
            description: `${center.name} matches incoming requests to registered routes and runs the middleware stack (auth, parsing, logging, error handling).`,
            whyItMatters: "The routing engine is the architectural center — it determines how every request is processed",
          });
        } else {
          // Generic library: describe it from its blocks
          const meaningfulBlocks = center.blocks
            .filter((b) => !["tests", "scripts", "docs", "examples"].includes(b.type))
            .map((b) => b.name)
            .slice(0, 3);
          if (meaningfulBlocks.length > 0) {
            steps.splice(1, 0, {
              label: "Core processing",
              systemName: center.name,
              description: `${center.name} applies its core logic through: ${meaningfulBlocks.join(", ")}.`,
              whyItMatters: "The primary value of the library — what it does that consumers don't need to implement themselves",
            });
          }
        }
      }

      steps.push({
        label: "Consumer output",
        description: consumers.length > 0
          ? `Results flow back to consuming code. Used by: ${consumers.join(", ")}.`
          : `The library produces its result — state updates, rendered output, or processed data.`,
        whyItMatters: "Where the library's value is realized in the consumer's application",
      });

      // Only emit library-api-flow if it has meaningful middle steps
      if (steps.length < 3) {
        return { id: "library-api-flow", title: `${center.name} API flow`, steps: [], confidence: "low" as const, type: "runtime" as const };
      }
      return {
        id: "library-api-flow",
        title: `${center.name} API flow`,
        steps,
        confidence: steps.length >= 4 ? "high" : "medium",
        type: "runtime",
      };
    },
  },

  {
    id: "library-runtime-flow",
    match: (ctx) => {
      if (!ctx.families.has("library") || !ctx.center) return false;
      const name = ctx.centerName.toLowerCase();
      return /redux|store|state|mobx|zustand|jotai|recoil|signal|observable|event|emitter|queue|stream/i.test(name) ||
        ctx.center!.description?.toLowerCase().includes("state") ||
        ctx.center!.description?.toLowerCase().includes("store") ||
        (ctx.center!.connections?.incoming?.length || 0) >= 2;
    },
    build: (ctx) => {
      const center = ctx.center!;
      const centerDesc = center.description?.split(".")[0] || "";
      const isStateLike = /state|store|redux|mobx|zustand|signal/i.test(ctx.centerName) ||
        /state|store/i.test(centerDesc);

      const steps: FlowStep[] = [];

      if (isStateLike) {
        steps.push(
          {
            label: "Consumer dispatches an action or update",
            systemName: center.name,
            description: `Application code calls into ${center.name} to signal a change — an action, event, or setter.`,
            whyItMatters: "The trigger — user interactions and side effects start here",
          },
          {
            label: "Middleware / interceptors process",
            systemName: center.name,
            description: "Optional middleware layer intercepts the action for logging, async handling, or transformation.",
            whyItMatters: "Where cross-cutting concerns like async, analytics, and persistence plug in",
          },
          {
            label: "Reducer / updater computes new state",
            systemName: center.name,
            description: "Pure transformation function takes the current state and action, returns the next state.",
            whyItMatters: "The core invariant — state transitions must be predictable and traceable",
          },
          {
            label: "Subscribers / selectors react",
            description: "Connected components and listeners are notified, re-rendering with the updated state.",
            whyItMatters: "Closes the loop — the UI reflects the new reality",
          },
        );
      } else {
        steps.push(
          {
            label: `Input enters ${center.name}`,
            systemName: center.name,
            description: `Consumer provides input to ${center.name}'s public API.`,
            whyItMatters: "The entry point — where external intent meets the library's processing",
          },
          {
            label: "Transform / process",
            systemName: center.name,
            description: `${center.name} applies its core logic — parsing, transforming, or computing.`,
            whyItMatters: "The library's primary value — the transformation consumers can't or shouldn't build themselves",
          },
          {
            label: "Output propagates",
            description: "Processed results flow back to the consumer as return values, events, or state updates.",
            whyItMatters: "Where the library's work becomes visible to the consuming application",
          },
        );
      }

      return {
        id: "library-runtime-flow",
        title: isStateLike ? "State management cycle" : `${center.name} processing pipeline`,
        steps,
        confidence: isStateLike ? "high" : "medium",
        type: "runtime",
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // CLI & SCAFFOLDING
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "scaffold-lifecycle",
    match: (ctx) =>
      ctx.hasSys(/^create-/) && !!ctx.center,
    build: (ctx) => {
      const scaffolder = ctx.findSys(/^create-/)!;
      const adapterZone = ctx.findZone(/adapter|deploy/i);
      const integrationZone = ctx.findZone(/integration/i);
      const steps: FlowStep[] = [
        {
          label: `Run ${scaffolder.name}`,
          systemName: scaffolder.name,
          description: `Developer runs ${scaffolder.name} to scaffold a new project from templates.`,
          whyItMatters: "First contact with the framework — sets up the foundation for everything else",
        },
        {
          label: `Dev / build with ${ctx.centerName}`,
          systemName: ctx.centerName,
          description: `The core CLI (${ctx.centerName}) serves or builds the project.`,
          whyItMatters: "Central orchestrator — all development and production builds go through this",
        },
      ];
      if (integrationZone) {
        steps.push({
          label: "Load integrations",
          zoneName: integrationZone.name,
          description: "Official integrations extend the pipeline with framework or feature support.",
          whyItMatters: "How the framework becomes customizable without core changes",
        });
      }
      if (adapterZone) {
        steps.push({
          label: "Deploy via adapter",
          zoneName: adapterZone.name,
          description: "Deployment adapters translate build output to platform-specific runtimes.",
          whyItMatters: "Bridges the gap between build output and where the code actually runs",
        });
      }
      return {
        id: "scaffold-lifecycle",
        title: "Project lifecycle",
        steps,
        confidence: "high",
        type: "dev",
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SHARED PATTERNS (cross-family)
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "compiler-pipeline",
    match: (ctx) =>
      (!!ctx.findZone(/compiler|codegen|transform/i) || ctx.hasSys(/compiler/i)) &&
      !!ctx.findZone(/core|runtime|internal/i),
    build: (ctx) => {
      const compilerZone = ctx.findZone(/compiler|codegen|transform/i);
      const runtimeZone = ctx.findZone(/core|runtime|internal/i);
      const hasServer = ctx.hasSys(/server/i);
      const steps: FlowStep[] = [
        {
          label: `Author ${ctx.centerName} source`,
          systemName: ctx.centerName,
          description: `Developer writes components or modules using ${ctx.centerName} syntax.`,
          whyItMatters: "Where developer intent is expressed in the framework's language",
        },
        {
          label: "Compile",
          zoneName: compilerZone?.name,
          description: "The compiler transforms source into optimized JavaScript output.",
          whyItMatters: "Transforms human-friendly syntax into machine-efficient code",
        },
      ];
      if (runtimeZone) {
        steps.push({
          label: "Execute through runtime",
          zoneName: runtimeZone.name,
          description: "Compiled output executes through the framework's internal runtime.",
          whyItMatters: "The runtime makes compiled code reactive, stateful, and interactive",
        });
      }
      if (hasServer) {
        steps.push({
          label: "Server rendering",
          description: "Server entry points render components for SSR or streaming.",
          whyItMatters: "Enables fast initial page loads and SEO by running on the server first",
        });
      }
      steps.push({
        label: "Browser / host output",
        description: "Final output runs in the browser or target host environment.",
        whyItMatters: "Where the user experiences the result — the end of the pipeline",
      });
      return {
        id: "compiler-pipeline",
        title: "Compile-to-runtime pipeline",
        steps,
        confidence: "high",
        type: "build",
      };
    },
  },

  {
    id: "content-pipeline",
    match: (ctx) => !!ctx.findZone(/content|markdown|mdx|remark/i),
    build: (ctx) => {
      const contentZone = ctx.findZone(/content|markdown|mdx|remark/i)!;
      const contentPkgs = (contentZone.systemNames || []).slice(0, 3);
      return {
        id: "content-pipeline",
        title: "Content processing",
        steps: [
          {
            label: "Author content",
            description: "Developers write Markdown, MDX, or structured content files.",
            whyItMatters: "Content is often the primary value — docs, blog posts, or page content",
          },
          {
            label: "Process through pipeline",
            zoneName: contentZone.name,
            description: `Content is parsed and transformed (${contentPkgs.join(", ")}).`,
            whyItMatters: "Converts raw markup into structured data the framework can render",
          },
          {
            label: "Render to pages",
            systemName: ctx.centerName,
            description: "The framework integrates processed content into the final output.",
            whyItMatters: "Where content becomes a page the user can actually see and interact with",
          },
        ],
        confidence: "medium",
        type: "content",
      };
    },
  },

  {
    id: "integration-extension",
    match: (ctx) => {
      const intZone = ctx.findZone(/integration|plugin|extension/i);
      const count = intZone?.systemNames?.length ?? 0;
      return count >= 3 && !!ctx.center;
    },
    build: (ctx) => {
      const intZone = ctx.findZone(/integration|plugin|extension/i)!;
      const sample = (intZone.systemNames || []).slice(0, 3).join(", ");
      return {
        id: "integration-extension",
        title: "Integration extension model",
        steps: [
          {
            label: `${ctx.centerName} provides extension API`,
            systemName: ctx.centerName,
            description: "The core package exposes hooks or extension points for plugins.",
            whyItMatters: "The contract that makes the ecosystem possible — stability here matters",
          },
          {
            label: "Integrations register",
            zoneName: intZone.name,
            description: `Official integrations (${sample}, ...) register with the core to add capabilities.`,
            whyItMatters: "Each integration unlocks a new use case without modifying the core",
          },
          {
            label: "Extended behavior at build/runtime",
            description: "Integration code runs during build or at runtime, extending default behavior.",
            whyItMatters: "Where the extension model pays off — customized behavior without core changes",
          },
        ],
        confidence: "medium",
        type: "runtime",
      };
    },
  },

  {
    id: "devtools-flow",
    match: (ctx) => !!ctx.findZone(/devtools|debug/i) && !!ctx.center,
    build: (ctx) => {
      const devZone = ctx.findZone(/devtools|debug/i)!;
      const devPkgs = (devZone.systemNames || []).slice(0, 3);
      return {
        id: "devtools-flow",
        title: "Developer tooling",
        steps: [
          {
            label: "Application runs in dev mode",
            systemName: ctx.centerName,
            description: `${ctx.centerName} emits debug hooks in development builds.`,
            whyItMatters: "Dev mode enables instrumentation — the foundation for all debugging",
          },
          {
            label: "DevTools connect",
            zoneName: devZone.name,
            description: `DevTools packages (${devPkgs.join(", ")}) attach to the runtime for inspection.`,
            whyItMatters: "Bridges the gap between running code and developer understanding",
          },
          {
            label: "Inspect & debug",
            description: "Developers use DevTools UI to profile, inspect state, and debug.",
            whyItMatters: "Direct impact on developer productivity — faster debugging means faster shipping",
          },
        ],
        confidence: "medium",
        type: "dev",
      };
    },
  },

  {
    id: "language-tools-flow",
    match: (ctx) => !!ctx.findZone(/language|lsp|vscode|editor/i),
    build: (ctx) => {
      const ltZone = ctx.findZone(/language|lsp|vscode|editor/i)!;
      const ltPkgs = (ltZone.systemNames || []).slice(0, 3);
      return {
        id: "language-tools-flow",
        title: "Editor integration",
        steps: [
          {
            label: `Author ${ctx.centerName} code`,
            description: `Developer writes ${ctx.centerName} code in their editor.`,
            whyItMatters: "Editor experience directly shapes how productive developers are",
          },
          {
            label: "Language server analysis",
            zoneName: ltZone.name,
            description: `Language tools (${ltPkgs.join(", ")}) provide diagnostics, completions, and type checking.`,
            whyItMatters: "Catches errors before build — shifts debugging left in the workflow",
          },
          {
            label: "Feedback loop",
            description: "Real-time editor feedback improves code quality before build.",
            whyItMatters: "Tight feedback loop between writing and validating code",
          },
        ],
        confidence: "medium",
        type: "dev",
      };
    },
  },

  // ═══════════════════════════════════════════════════════════════════
  // SINGLE-PACKAGE EXPRESS / FULLSTACK APP
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "express-server-flow",
    match: (ctx) => {
      const hasExpressTech = ctx.systems.some((s) =>
        (s.detectedTech || []).some((t) => /express|fastify|hono|koa/i.test(t))
      );
      const hasServerZone = ctx.zones.some((z) => /server/i.test(z.name)) ||
        ctx.systems.some((s) => s.internalStructure?.zones.some((z) => /server/i.test(z.label)));
      const hasClientZone = ctx.zones.some((z) => /client/i.test(z.name)) ||
        ctx.systems.some((s) => s.internalStructure?.zones.some((z) => /client/i.test(z.label)));
      const isSinglePackage = ctx.systems.filter((s) => s.type !== "support-system").length <= 2;
      return hasExpressTech && (hasServerZone || hasClientZone) && isSinglePackage;
    },
    build: (ctx) => {
      const mainSys = ctx.systems.find((s) => s.type !== "support-system") || ctx.systems[0];
      const internalZones = mainSys?.internalStructure?.zones ?? [];
      const serverZone = internalZones.find((z) => /server/i.test(z.label));
      const clientZone = internalZones.find((z) => /client/i.test(z.label));
      const clientName = clientZone ? `${clientZone.label} (${clientZone.fileCount} files)` : "Client";

      // Detect tech for richer descriptions
      const tech = mainSys?.detectedTech ?? [];
      const hasReact = tech.some((t) => /react/i.test(t));
      const hasExpress = tech.some((t) => /express/i.test(t));
      const frameworkNote = hasExpress ? "Express" : "HTTP server";

      // Find any API/routes zone for a better description
      const routesZone = internalZones.find((z) => /route|api|controller|handler/i.test(z.label));
      const dbZone = internalZones.find((z) => /database|db|prisma|model/i.test(z.label));

      const steps: FlowStep[] = [
        {
          label: "HTTP request arrives",
          systemName: mainSys?.name,
          description: `An incoming HTTP request is received by the ${frameworkNote} layer${serverZone ? ` (${serverZone.label}, ${serverZone.fileCount} files)` : ""}. Middleware stack runs: authentication, parsing, rate-limiting.`,
          whyItMatters: "The entry point — every interaction enters through here before any business logic runs",
        },
        {
          label: routesZone ? `${routesZone.label} handle request` : "Route handlers process request",
          systemName: mainSys?.name,
          description: routesZone
            ? `The router matches the URL to a handler in ${routesZone.label} (${routesZone.fileCount} files) — business logic and data access happen here.`
            : `The HTTP router matches the URL and delegates to the appropriate handler for business logic and data fetching.`,
          whyItMatters: "Where the application decides what to do — routing is the architectural control center",
        },
      ];

      if (dbZone) {
        steps.push({
          label: `Data access via ${dbZone.label}`,
          systemName: mainSys?.name,
          description: `Handler queries the ${dbZone.label} layer (${dbZone.fileCount} files) for persistence or retrieval.`,
          whyItMatters: "The source of truth — all state changes flow through the data layer",
        });
      }

      if (clientZone) {
        steps.push({
          label: `${clientZone.label} renders response`,
          description: `The ${clientName} layer${hasReact ? " (React)" : ""} renders the UI — either server-side templates or a client-side SPA that hydrates from the API response.`,
          whyItMatters: "What the user actually sees — the final output of the request pipeline",
        });
      }

      steps.push({
        label: "Response returned",
        description: "Processed data or rendered HTML is serialized, headers set, and the response dispatched to the client.",
        whyItMatters: "The end of the round trip — performance here directly affects user-perceived latency",
      });

      return {
        id: "express-server-flow",
        title: "Request / response cycle",
        steps,
        confidence: "medium" as const,
        type: "runtime" as const,
      };
    },
  },

  {
    id: "build-infra",
    match: (ctx) => !!ctx.findZone(/build|tooling|scripts/i),
    build: (ctx) => {
      const buildZone = ctx.findZone(/build|tooling|scripts/i)!;
      const buildPkgs = (buildZone.systemNames || []).slice(0, 3);
      return {
        id: "build-infra",
        title: "Build & release pipeline",
        steps: [
          {
            label: "Source packages",
            description: "Developers edit source across workspace packages.",
            whyItMatters: "All changes start here — the input to the entire build pipeline",
          },
          {
            label: "Build orchestration",
            zoneName: buildZone.name,
            description: `Build scripts (${buildPkgs.join(", ")}) compile and bundle packages.`,
            whyItMatters: "Transforms source into distributable artifacts — the production gate",
          },
          {
            label: "Publish artifacts",
            description: "Built packages are published to npm or deployed.",
            whyItMatters: "The final step — where code becomes available to consumers",
          },
        ],
        confidence: "low",
        type: "build",
      };
    },
  },

  {
    id: "single-pkg-runtime",
    match: (ctx) =>
      ctx.families.has("frontend-framework") &&
      !ctx.findZone(/^Core Runtime$/i) &&
      !ctx.findZone(/^Renderers/i) &&
      ctx.zones.some((z) => /compiler/i.test(z.name)) &&
      ctx.zones.some((z) => /internal|runtime/i.test(z.name)),
    build: (ctx) => {
      const compilerZone = ctx.findZone(/compiler/i);
      const internalZone = ctx.findZone(/internal|runtime/i);
      const hasServer = ctx.zones.some((z) => /server/i.test(z.name));
      const steps: FlowStep[] = [
        {
          label: `Write ${ctx.centerName} components`,
          systemName: ctx.centerName,
          description: `Developer authors components using ${ctx.centerName} syntax.`,
          whyItMatters: "The developer-facing API — how users express intent in the framework",
        },
        {
          label: "Compile to JavaScript",
          zoneName: compilerZone?.name,
          description: `The compiler transforms ${ctx.centerName} components into optimized JavaScript.`,
          whyItMatters: "Ahead-of-time optimization that makes the runtime minimal",
        },
        {
          label: "Execute through runtime",
          zoneName: internalZone?.name,
          description: "Compiled output executes through the internal runtime (reactivity, DOM updates, lifecycle).",
          whyItMatters: "Where compiled code becomes alive — reactivity and state management happen here",
        },
      ];
      if (hasServer) {
        const serverZone = ctx.findZone(/server/i);
        steps.push({
          label: "Server-side rendering",
          zoneName: serverZone?.name,
          description: "Server entry renders components for SSR or streaming output.",
          whyItMatters: "Enables fast initial page loads by pre-rendering on the server",
        });
      }
      steps.push({
        label: "Browser output",
        description: "Final output runs in the browser with minimal runtime overhead.",
        whyItMatters: "End-user experience — performance here directly impacts users",
      });
      return {
        id: "single-pkg-runtime",
        title: "Component lifecycle",
        steps,
        confidence: "high",
        type: "rendering",
      };
    },
  },
];

// ── Universal fallback ────────────────────────────────────────────────

function buildUniversalFallback(ctx: PatternCtx): RepoFlow | null {
  const primary = ctx.systems.filter((s) => s.systemTier === "primary");
  const secondary = ctx.systems.filter((s) => s.systemTier === "secondary");
  if (primary.length === 0) return null;

  const steps: FlowStep[] = [];

  if (ctx.center) {
    const outgoing = ctx.center.connections?.outgoing || [];
    const incoming = ctx.center.connections?.incoming || [];
    const consumers = incoming.slice(0, 3).map((c) => c.targetSystemName);
    const dependencies = outgoing.slice(0, 3).map((c) => c.targetSystemName);

    steps.push({
      label: `Entry: ${ctx.centerName}`,
      systemName: ctx.centerName,
      description: `${ctx.centerName} is the architectural center — ${incoming.length} systems depend on it.`,
      whyItMatters: "Everything in the codebase connects through or depends on this",
    });

    if (dependencies.length > 0) {
      steps.push({
        label: "Core dependencies",
        description: `${ctx.centerName} builds on: ${dependencies.join(", ")}.`,
        whyItMatters: "The foundation layer — changes here ripple through the entire system",
      });
    }

    if (consumers.length > 0) {
      steps.push({
        label: "Consumer layer",
        description: `Consumed by: ${consumers.join(", ")}${incoming.length > 3 ? ` and ${incoming.length - 3} more` : ""}.`,
        whyItMatters: "These systems depend on the core — understanding them reveals how the API is used",
      });
    }
  } else {
    const topSystems = primary.slice(0, 3);
    steps.push({
      label: "Primary systems",
      description: `The codebase is built around ${topSystems.map((s) => s.name).join(", ")}.`,
      whyItMatters: "These are the most important systems — start here to understand the architecture",
    });
  }

  if (secondary.length > 0) {
    steps.push({
      label: "Supporting layer",
      description: `${secondary.slice(0, 4).map((s) => s.name).join(", ")} provide supporting infrastructure.`,
      whyItMatters: "Shared utilities and infrastructure that primary systems rely on",
    });
  }

  if (steps.length < 2) return null;

  return {
    id: "universal-architecture",
    title: "Architecture overview",
    steps,
    confidence: "low",
    type: "runtime",
  };
}

// ── Evidence-backed route flow builder ───────────────────────────────
//
// Converts real detected routes (file + line anchored) into RepoFlow objects.
// These are the only flows that satisfy the Memor Law: every step points back
// to a specific file and line in the actual codebase.

function buildEvidenceFlows(systems: MemorSystem[]): RepoFlow[] {
  const out: RepoFlow[] = [];

  for (const sys of systems) {
    const routes = sys.detectedRoutes;
    if (!routes || routes.length === 0) continue;

    // Group by top-level path segment (e.g. /api/users/:id → "users")
    const groups = new Map<string, DetectedRoute[]>();
    for (const r of routes) {
      // Skip USE/middleware mounts — they're not callable endpoints
      if (r.method === "USE") continue;
      const seg = r.path.split("/").filter(Boolean)[0] ?? "root";
      if (!groups.has(seg)) groups.set(seg, []);
      groups.get(seg)!.push(r);
    }

    let groupIdx = 0;
    for (const [seg, groupRoutes] of groups) {
      // Cap at 5 groups per system and 8 routes per group
      if (groupIdx >= 5) break;
      const sample = groupRoutes.slice(0, 8);

      const steps: FlowStep[] = sample.map((r) => ({
        label: `${r.method} ${r.path}`,
        systemName: sys.name,
        description: r.handlerName
          ? `${r.handlerName}() in ${r.file}`
          : r.file,
        evidenceFile: r.file,
        evidenceLine: r.line,
        handlerName: r.handlerName,
      }));

      out.push({
        id: `evidence-routes-${sys.name}-${seg}`,
        title: `${sys.name} /${seg} routes`,
        steps,
        confidence: "high",
        type: "runtime",
        isMain: groupIdx === 0 && out.length === 0,
        derivedFrom: "evidence",
      });
      groupIdx++;
    }
  }

  return out;
}

// ── Main generator ────────────────────────────────────────────────────

export function generateRepoFlows(
  analysis: RepoAnalysis,
  story: RepoStory
): RepoFlow[] {
  const { systems, repoMode } = analysis;
  const center = systems.find((s) => s.isRepoCenter);
  const centerName = center?.name ?? analysis.repoName;
  const zoneNames = new Set(story.zones.map((z) => z.name));
  const sysNames = new Set(systems.map((s) => s.name.toLowerCase()));
  const families = inferFlowFamilies(repoMode, systems, story.zones);

  // For single-package repos, the one real package is always the center even if
  // detectRepoCenterSystems didn't mark it (that requires ≥3 systems).
  const effectiveCenter =
    center ??
    (systems.filter((s) => s.type !== "support-system").length === 1
      ? systems.find((s) => s.type !== "support-system")
      : undefined);
  const effectiveCenterName = effectiveCenter?.name ?? centerName;

  const ctx: PatternCtx = {
    systems,
    zones: story.zones,
    center: effectiveCenter,
    centerName: effectiveCenterName,
    repoMode,
    families,
    zoneNames,
    sysNames,
    hasZone: (name) => zoneNames.has(name),
    findZone: (pattern) => story.zones.find((z) => pattern.test(z.name)),
    hasSys: (pattern) => systems.some((s) => pattern.test(s.name)),
    findSys: (pattern) => systems.find((s) => pattern.test(s.name)),
    findSysByType: (type) => systems.filter((s) => s.type === type),
  };

  // ── Evidence-backed route flows (highest priority) ────────────────
  // These are derived from real detected route registrations (file + line anchored).
  // Always prepended — never replaced by pattern flows.
  const evidenceFlows = buildEvidenceFlows(systems);

  const flows: RepoFlow[] = [...evidenceFlows];
  const usedIds = new Set<string>(evidenceFlows.map((f: RepoFlow) => f.id));

  for (const pattern of FLOW_PATTERNS) {
    if (usedIds.has(pattern.id)) continue;
    try {
      if (pattern.match(ctx)) {
        const flow = pattern.build(ctx);
        if (flow.steps.length >= 2) {
          // Filter trivially useless 2-step flows: "Import X → Consumer output"
          const isUselessImportFlow = flow.steps.length === 2 &&
            /^import\s/i.test(flow.steps[0].label) &&
            /consumer output/i.test(flow.steps[flow.steps.length - 1].label);
          if (isUselessImportFlow) continue;

          // Don't add low-confidence build-infra if we already have better flows
          const isBuildInfraFallback = pattern.id === "build-infra" &&
            flows.some(f => f.confidence === "high" || f.confidence === "medium");
          if (isBuildInfraFallback) continue;

          flows.push(flow);
          usedIds.add(pattern.id);
        }
      }
    } catch {
      // ignore individual pattern failures
    }
  }

  // Universal fallback if no patterns matched
  if (flows.length === 0) {
    const fallback = buildUniversalFallback(ctx);
    if (fallback) flows.push(fallback);
  }

  // Mark first flow as main
  if (flows.length > 0) {
    flows[0].isMain = true;
  }

  return flows;
}
