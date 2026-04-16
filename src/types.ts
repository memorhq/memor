/** Domain model for Memor repo analysis output */

/** High-level repository character — what kind of codebase this is */
export type RepoMode =
  | "surface-platform"
  | "product-domain-machine"
  | "framework-core"
  | "library-tooling"
  | "workflow-platform"
  | "product-web-app"
  | "unknown";

export type RepoAnalysis = {
  repoName: string;
  rootPath: string;
  repoMode: RepoMode;
  repoCenter: string;
  repoNarrative: string;
  systems: MemorSystem[];
  ignoredPaths: string[];
  summary: RepoSummary;
  /**
   * Deterministic repo purpose inferred from file density, config files,
   * package.json scripts/dependencies. Never guessed. Every signal has evidence.
   */
  inferredRepoPurpose?: import("./scanner/detectRepoPurpose").InferredRepoPurpose;
};

export type RepoSummary = {
  totalFiles: number;
  totalDirectories: number;
  detectedFrameworks: string[];
  detectedRepoStyle: "monorepo" | "single-app" | "multi-system" | "unknown";
  totalSystems: number;
};

/** How prominently this system should surface for a new developer */
export type SystemTier = "primary" | "secondary" | "support";

/** Whether you run this, import it, or mostly configure around it */
export type RuntimeRole = "runnable" | "consumable" | "support";

/** Runnable web-app flavor (secondary to system.type === web-app) */
export type AppArchetype =
  | "product-app"
  | "marketing-site"
  | "docs-app"
  | "admin-app"
  | "component-showcase"
  | "learning-app"
  | "unknown";

/** Semantic package label (secondary to system.type) */
export type PackageArchetype =
  | "ui-library"
  | "database-package"
  | "config-package"
  | "types-package"
  | "integration-package"
  | "feature-package"
  | "localization-package"
  | "email-package"
  | "embeddable-package"
  | "platform-package"
  | "tooling-package"
  | "utility-package"
  | "documentation-package"
  | "unknown";

/** Repo-mode-aware role clarification — secondary to system.type */
export type SystemRoleHint =
  | "framework-core-package"
  | "framework-adapter-package"
  | "framework-tooling-package"
  | "primary-library-package"
  | "workflow-core-package"
  | "workflow-provider-package"
  | "workflow-support-package"
  | "unknown";

/** Lightweight inferred support role for secondary/support systems */
export type SupportRole =
  | "development-tooling"
  | "ecosystem-extension"
  | "shared-contracts"
  | "runtime-support"
  | "packaging-distribution"
  | "docs-content"
  | "test-harness"
  | "adapter-bridge"
  | "workflow-logic"
  | "infra-config-support"
  | "devtools-instrumentation"
  | "renderer-binding"
  | "cli-utility";

/** Major internal surface inside a primary system (lightweight second layer) */
export type SubsystemKind =
  | "api-version"
  | "feature-area"
  | "docs-section"
  | "worker-surface"
  | "module"
  | "unknown";

export type SystemSubsystem = {
  id: string;
  name: string;
  path: string;
  kind: SubsystemKind;
  description: string;
  confidence: number;
  recommendedStartPath?: string;
};

export type MemorSystem = {
  id: string;
  name: string;
  type: SystemType;
  /** Runnable / user-facing vs shared vs tooling */
  systemTier: SystemTier;
  runtimeRole: RuntimeRole;
  /** 0–1, higher = sort first in reports */
  importanceScore: number;
  /** Best single place to open first, when inferable */
  recommendedStartPath?: string;
  /** Why this start path was chosen */
  startPathReason?: string;
  /** Confidence tier for the start path selection */
  startPathConfidence?: "high" | "medium" | "fallback";
  /** Structural quality of the recommended start path */
  startPathQuality?: "strong-runtime-entry" | "source-anchor" | "metadata-fallback" | "none";
  /** Human-readable package role when not a primary app surface */
  packageArchetype?: PackageArchetype;
  /** Runnable web-app character (only for web-app + runnable) */
  appArchetype?: AppArchetype;
  /** Repo-mode-aware role clarification */
  systemRoleHint?: SystemRoleHint;
  /** Whether this system is the center of gravity for the repo */
  isRepoCenter?: boolean;
  /** Lightweight inferred role for secondary/support systems */
  inferredSupportRole?: SupportRole;
  /** Notable internal modules (primary systems only, conservative) */
  subsystems?: SystemSubsystem[];
  /** Description from the package's own package.json */
  packageDescription?: string;
  /** Excerpt extracted from the system's README.md */
  readmeExcerpt?: string;
  /** Detected languages, frameworks, runtimes for this system */
  detectedTech?: string[];
  rootPath: string;
  confidence: number;
  description: string;
  entryPoints: EntryPoint[];
  blocks: SystemBlock[];
  flows: FlowSkeleton[];
  tags: string[];
  /** System-level connections to other detected systems */
  connections?: SystemConnections;
  /** Internal zone structure for intra-system architecture */
  internalStructure?: InternalStructure;
  /**
   * HTTP routes detected from actual source code (Express, Fastify, NestJS, etc.)
   * Each entry traces back to a real file + line. Never synthesized.
   */
  detectedRoutes?: import("./scanner/detectRoutes").DetectedRoute[];
  /**
   * Database operations detected from actual source code (Prisma, Drizzle, Mongoose, etc.)
   * Each entry traces back to a real file + line. Never synthesized.
   */
  detectedDBOps?: import("./scanner/detectDBOps").DBOperation[];
};

export type SystemType =
  | "web-app"
  | "api-service"
  | "ui-library"
  | "docs-site"
  | "shared-package"
  | "infra"
  | "worker"
  | "support-system"
  | "unknown";

export type EntryPoint = {
  path: string;
  kind: "web" | "api" | "library" | "docs" | "infra" | "unknown";
  reason: string;
  confidence: number;
};

export type SystemBlock = {
  id: string;
  name: string;
  type: BlockType;
  path: string;
  reason?: string;
};

export type BlockType =
  | "routes"
  | "ui-components"
  | "features"
  | "state"
  | "api-layer"
  | "services"
  | "database"
  | "integrations"
  | "schemas"
  | "docs"
  | "config"
  | "source-tree"
  | "utilities"
  | "constants"
  | "type-definitions"
  | "database-migrations"
  | "localization"
  | "templates"
  | "hooks"
  | "library-code"
  | "generated-code"
  | "static-assets"
  | "scripts"
  | "cli"
  | "tests"
  | "mocks"
  | "server-code"
  | "client-code"
  | "examples"
  | "email-module"
  | "embeddable-components"
  | "providers"
  | "operators"
  | "workflows"
  | "tasks"
  | "plugins"
  | "adapters"
  | "transport"
  | "orchestration"
  | "sdks"
  | "domain-package"
  | "unknown";

/** Directed system-to-system relationship */
export type ConnectionRelation = "uses" | "used-by" | "extends" | "bridges";

export type SystemConnection = {
  targetSystemId: string;
  targetSystemName: string;
  relation: ConnectionRelation;
  confidence: number;
  reason: string;
};

export type SystemConnections = {
  outgoing: SystemConnection[];
  incoming: SystemConnection[];
};

export type FlowSkeleton = {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
  confidence: number;
  /** How this flow was derived. "evidence" = from detected routes/calls. "pattern" = structural heuristic. */
  derivedFrom?: FlowDerivation;
};

export type FlowStep = {
  label: string;
  type:
    | "ui"
    | "route"
    | "api-call"
    | "service"
    | "db"
    | "external"
    | "config"
    | "unknown";
  /** Legacy field — prefer `evidenceFile` for new code */
  path?: string;
  /** Relative file path this step was detected from (evidence anchor) */
  evidenceFile?: string;
  /** 1-based line number of the evidence in `evidenceFile` */
  evidenceLine?: number;
  /** Detected handler/function name (for route steps) */
  handlerName?: string;
};

/** Whether this flow was derived from detected code or assembled from structural patterns */
export type FlowDerivation = "evidence" | "pattern";

// ── System focus view model ───────────────────────────────────────────

export type SystemFocusView = {
  kind: "system-focus";
  repoName: string;
  repoSlug: string;
  title: string;
  summary: string;
  centerSystemId: string;
  centerSystemName: string;
  centerTier: SystemTier;
  centerRole?: string;
  incomingCount: number;
  outgoingCount: number;
  nodes: ConnectionGraphNode[];
  edges: ConnectionGraphEdge[];
};

// ── Connection graph view model ───────────────────────────────────────

export type ConnectionGraphNode = {
  id: string;
  label: string;
  systemId: string;
  tier: SystemTier;
  type: SystemType;
  isRepoCenter?: boolean;
  roleHint?: string;
  importance: number;
  /** Layout layer: 0 = top (primary/center), 1 = middle, 2 = bottom */
  layer: number;
  /** Short role descriptor shown below the label */
  subtitle?: string;
  /** Languages, frameworks, runtimes detected for this system */
  tech?: string[];
  /** When > 1, this node represents a collapsed group of similar systems */
  collapsedCount?: number;
  /** Names of grouped members (for cluster node rendering) */
  memberNames?: string[];
  /** Slug for focus view filename (may differ from label for collapsed groups) */
  focusSlug?: string;
};

export type EdgeEmphasis = "strong" | "medium";

export type ConnectionGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "uses" | "extends" | "bridges";
  confidence: number;
  reason: string;
  emphasis: EdgeEmphasis;
};

export type ConnectionGraphGroup = {
  id: string;
  label: string;
  nodeIds: string[];
};

export type ConnectionGraphView = {
  kind: "connection-graph";
  repoName: string;
  repoMode: RepoMode;
  title: string;
  description: string;
  /** One-sentence structural summary for the graph header */
  summary: string;
  nodes: ConnectionGraphNode[];
  edges: ConnectionGraphEdge[];
  groups: ConnectionGraphGroup[];
};

// ── Intra-system architecture types ──────────────────────────────────

export type InternalZoneKind =
  | "entry"
  | "route"
  | "feature-area"
  | "ui"
  | "logic"
  | "api"
  | "state"
  | "provider"
  | "config"
  | "support";

export type InternalZone = {
  id: string;
  label: string;
  kind: InternalZoneKind;
  path: string;
  fileCount: number;
  importance: number;
};

export type InternalDependency = {
  sourceZoneId: string;
  targetZoneId: string;
  importCount: number;
};

export type InternalStructure = {
  zones: InternalZone[];
  dependencies: InternalDependency[];
};

export type InternalNode = {
  id: string;
  label: string;
  kind: InternalZoneKind;
  path: string;
  importance: number;
  fileCount: number;
  layer: number;
};

export type InternalEdge = {
  id: string;
  source: string;
  target: string;
  relation: "uses" | "routes-to";
  weight: number;
};

export type InternalArchitectureView = {
  kind: "internal-architecture";
  systemId: string;
  systemName: string;
  title: string;
  summary: string;
  nodes: InternalNode[];
  edges: InternalEdge[];
};

/** Internal: normalized scan tree node */
export type ScanNode = {
  fullPath: string;
  relativePath: string;
  name: string;
  extension: string;
  isDirectory: boolean;
  children: ScanNode[];
};

export type ScanMeta = {
  skippedDirs: number;
  hitDepthLimit: boolean;
  hitChildCap: boolean;
};

export type ScanResult = {
  root: ScanNode;
  ignoredPaths: string[];
  deprioritizedPaths: string[];
  meta: ScanMeta;
};

export type FlatScanEntry = {
  fullPath: string;
  relativePath: string;
  name: string;
  extension: string;
  isDirectory: boolean;
};

/** Repo-level signals from manifests and config files */
export type RepoSignals = {
  frameworks: string[];
  isMonorepoLayout: boolean;
  hasAppsDir: boolean;
  hasPackagesDir: boolean;
  packageManagers: string[];
  /** Relative paths that existed and were read or detected */
  signalPaths: string[];
};

export type SystemCandidate = {
  name: string;
  rootPath: string;
  relativeRoot: string;
  reason: string;
  /** True for directories that are architecturally significant but lack package.json */
  isNonPackage?: boolean;
};

/** Passed into classification — must not rely on repo-root signals leaking in */
export type ClassifyContext = {
  candidateFolderName: string;
  /** Repo-relative path, e.g. `apps/web` or `.` */
  relativeRoot: string;
};
