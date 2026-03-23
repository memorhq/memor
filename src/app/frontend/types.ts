export type SystemTier = "primary" | "secondary" | "support";

export type ConnectionGraphNode = {
  id: string;
  label: string;
  systemId: string;
  tier: SystemTier;
  type: string;
  isRepoCenter?: boolean;
  roleHint?: string;
  importance: number;
  layer: number;
  subtitle?: string;
  tech?: string[];
  collapsedCount?: number;
  memberNames?: string[];
  focusSlug?: string;
};

export type ConnectionGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: "uses" | "extends" | "bridges";
  confidence: number;
  reason: string;
  emphasis: "strong" | "medium";
};

export type ConnectionGraphView = {
  kind: "connection-graph";
  repoName: string;
  repoMode: string;
  title: string;
  description: string;
  summary: string;
  nodes: ConnectionGraphNode[];
  edges: ConnectionGraphEdge[];
  groups: { id: string; label: string; nodeIds: string[] }[];
};

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

export type MemorSystem = {
  id: string;
  name: string;
  systemTier: SystemTier;
  type: string;
  description: string;
  isRepoCenter?: boolean;
  recommendedStartPath?: string;
  startPathReason?: string;
  systemRoleHint?: string;
  inferredSupportRole?: string;
  packageArchetype?: string;
  appArchetype?: string;
  detectedTech?: string[];
  blocks?: { type: string }[];
  entryPoints?: { path: string; kind: string; reason: string }[];
  connections?: {
    outgoing: {
      targetSystemId: string;
      targetSystemName: string;
      relation: string;
      confidence: number;
      reason: string;
    }[];
    incoming: {
      targetSystemId: string;
      targetSystemName: string;
      relation: string;
      confidence: number;
      reason: string;
    }[];
  };
  internalStructure?: {
    zones: { id: string; label: string; kind: string; path: string; fileCount: number; importance: number }[];
    dependencies: { sourceZoneId: string; targetZoneId: string; importCount: number }[];
  };
};

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
  steps: {
    label: string;
    description: string;
    whyItMatters?: string;
    systemName?: string;
    zoneName?: string;
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

export type ImpactEntry = {
  systemId: string;
  systemName: string;
  zoneName: string;
  reason: string;
  risk: "high" | "medium" | "low";
  impactType: string;
  via?: string[];
};

export type ChangeImpactResult = {
  selectedSystem: string;
  selectedSystemId: string;
  summary: string;
  directImpacts: ImpactEntry[];
  indirectImpacts: ImpactEntry[];
  blastRadiusScore: number;
  blastRadiusLevel: "local" | "contained" | "broad" | "architectural";
  confidence: "high" | "medium" | "low";
};

export type AhaGlance = {
  repoType: string;
  systems: number;
  zones: number;
  flows: number;
  strongCouplings: number;
  highestRiskSystem?: string;
  highestRiskScore?: number;
  highestRiskLevel?: string;
};

export type AhaSummary = {
  headline: string;
  subheadline: string;
  bullets: string[];
  warnings: string[];
  glance: AhaGlance;
};

export type DemoStep = {
  step: number;
  title: string;
  target: string;
  description: string;
};

export type DemoScript = {
  steps: DemoStep[];
};

export type QualityConcern = {
  signal: string;
  detail: string;
};

export type AnalysisQuality = {
  confidence: "high" | "moderate" | "low";
  concerns: QualityConcern[];
  suggestion: string;
  metrics: {
    totalFiles: number;
    totalSystems: number;
    connectedSystems: number;
    connectionRatio: number;
    unknownTypeCount: number;
    unknownTypeRatio: number;
    avgSystemConfidence: number;
    repoModeResolved: boolean;
    zoneCount: number;
    partialScan: boolean;
    partialScanReason?: string;
  };
};

export type AppData = {
  analysis: {
    repoName: string;
    rootPath?: string;
    repoMode: string;
    repoNarrative?: string;
    repoCenter?: string;
    systems: MemorSystem[];
    summary: {
      totalFiles: number;
      totalDirectories: number;
      detectedRepoStyle: string;
      detectedFrameworks: string[];
    };
  };
  connectionGraph: ConnectionGraphView | null;
  focusViews: Record<string, SystemFocusView>;
  internalViews: Record<string, InternalArchitectureView>;
  impactResults?: Record<string, ChangeImpactResult>;
  repoStory?: RepoStory;
  ahaSummary?: AhaSummary;
  demoScript?: DemoScript;
  logoDataUri?: string;
  techIcons?: Record<string, string>;
  quality?: AnalysisQuality;
};
