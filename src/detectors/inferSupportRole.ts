import type { BlockType, MemorSystem, RepoMode, SupportRole } from "../types";

type RoleScore = { role: SupportRole; score: number };

const BLOCK_ROLE_MAP: Partial<Record<BlockType, { role: SupportRole; weight: number }[]>> = {
  cli:             [{ role: "cli-utility", weight: 0.7 }],
  scripts:         [{ role: "development-tooling", weight: 0.4 }],
  tests:           [{ role: "test-harness", weight: 0.18 }],
  mocks:           [{ role: "test-harness", weight: 0.12 }],
  config:          [{ role: "infra-config-support", weight: 0.3 }],
  docs:            [{ role: "docs-content", weight: 0.35 }],
  examples:        [{ role: "docs-content", weight: 0.25 }],
  schemas:         [{ role: "shared-contracts", weight: 0.5 }],
  "type-definitions": [{ role: "shared-contracts", weight: 0.5 }],
  adapters:        [{ role: "adapter-bridge", weight: 0.6 }],
  transport:       [{ role: "adapter-bridge", weight: 0.5 }],
  providers:       [{ role: "ecosystem-extension", weight: 0.55 }],
  operators:       [{ role: "ecosystem-extension", weight: 0.55 }],
  plugins:         [{ role: "ecosystem-extension", weight: 0.55 }],
  sdks:            [{ role: "ecosystem-extension", weight: 0.5 }],
  integrations:    [{ role: "ecosystem-extension", weight: 0.45 }],
  workflows:       [{ role: "workflow-logic", weight: 0.6 }],
  tasks:           [{ role: "workflow-logic", weight: 0.5 }],
  orchestration:   [{ role: "workflow-logic", weight: 0.6 }],
  "source-tree":   [{ role: "runtime-support", weight: 0.15 }],
  "library-code":  [{ role: "runtime-support", weight: 0.25 }],
  utilities:       [{ role: "runtime-support", weight: 0.2 }],
  "static-assets": [{ role: "packaging-distribution", weight: 0.2 }],
  templates:       [{ role: "packaging-distribution", weight: 0.25 }],
  "generated-code": [{ role: "packaging-distribution", weight: 0.2 }],
};

const NAME_ROLE_PATTERNS: { pattern: RegExp; role: SupportRole; weight: number }[] = [
  { pattern: /devtools|dev-tools|debug-tools|profil/, role: "devtools-instrumentation", weight: 0.7 },
  { pattern: /test-renderer|test-utils|testing|jest-|vitest-|cypress|playwright/, role: "test-harness", weight: 0.65 },
  { pattern: /eslint|prettier|lint|stylelint|commitlint/, role: "development-tooling", weight: 0.7 },
  { pattern: /cli$|[-/]cli$|^cli[-/]|ctl$|[-/]ctl$/, role: "cli-utility", weight: 0.7 },
  { pattern: /^scripts$|build-tools|tooling|codemods?|codegen|generator/, role: "development-tooling", weight: 0.6 },
  { pattern: /renderer|bindings|dom-bindings|native-renderer/, role: "renderer-binding", weight: 0.65 },
  { pattern: /server-dom|server-components/, role: "renderer-binding", weight: 0.6 },
  { pattern: /adapter|bridge|gateway|proxy/, role: "adapter-bridge", weight: 0.6 },
  { pattern: /provider|operators|hooks-ecosystem/, role: "ecosystem-extension", weight: 0.55 },
  { pattern: /sdk|sdks|client-lib/, role: "ecosystem-extension", weight: 0.5 },
  { pattern: /^docs$|documentation|guidebook|content/, role: "docs-content", weight: 0.6 },
  { pattern: /types|typings|contracts|schemas/, role: "shared-contracts", weight: 0.55 },
  { pattern: /shared|common|utils|helpers|core-util/, role: "runtime-support", weight: 0.4 },
  { pattern: /infra|deploy|docker|k8s|helm|terraform/, role: "infra-config-support", weight: 0.6 },
  { pattern: /config|tsconfig|eslint-config/, role: "infra-config-support", weight: 0.5 },
  { pattern: /workflow|dags|scheduler|executor|orchestrat/, role: "workflow-logic", weight: 0.55 },
  { pattern: /dist|publish|release|packaging/, role: "packaging-distribution", weight: 0.5 },
  { pattern: /icons|assets|fonts|images|media/, role: "packaging-distribution", weight: 0.4 },
];

function scoreBlocks(system: MemorSystem): RoleScore[] {
  const scores = new Map<SupportRole, number>();
  for (const block of system.blocks) {
    const mappings = BLOCK_ROLE_MAP[block.type];
    if (!mappings) continue;
    for (const m of mappings) {
      scores.set(m.role, (scores.get(m.role) || 0) + m.weight);
    }
  }
  return [...scores.entries()].map(([role, score]) => ({ role, score }));
}

function scoreName(name: string): RoleScore[] {
  const n = name.toLowerCase();
  const hits: RoleScore[] = [];
  for (const p of NAME_ROLE_PATTERNS) {
    if (p.pattern.test(n)) {
      hits.push({ role: p.role, score: p.weight });
    }
  }
  return hits;
}

function repoModeBoost(role: SupportRole, repoMode: RepoMode): number {
  if (repoMode === "workflow-platform") {
    if (role === "workflow-logic" || role === "ecosystem-extension") return 0.15;
  }
  if (repoMode === "framework-core") {
    if (role === "renderer-binding" || role === "adapter-bridge") return 0.15;
    if (role === "devtools-instrumentation" || role === "test-harness") return 0.1;
    if (role === "runtime-support") return 0.15;
  }
  if (repoMode === "library-tooling") {
    if (role === "development-tooling") return 0.1;
  }
  if (repoMode === "product-domain-machine") {
    if (role === "workflow-logic") return -0.2;
  }
  return 0;
}

/**
 * For framework-core repos, packages with the framework name prefix
 * and minimal structure are likely runtime support modules.
 */
function frameworkPackageFallback(
  system: MemorSystem,
  repoMode: RepoMode
): SupportRole | undefined {
  if (repoMode !== "framework-core") return undefined;

  const meaningfulBlocks = system.blocks.filter(
    (b) => b.type !== "source-tree" && b.type !== "tests" && b.type !== "config" &&
           b.type !== "scripts" && b.type !== "unknown"
  );
  if (meaningfulBlocks.length > 0) return undefined;

  const n = system.name.toLowerCase();
  if (/renderer|bindings|dom-binding|native-renderer/.test(n)) return "renderer-binding";
  if (/devtools|debug|profil/.test(n)) return "devtools-instrumentation";
  if (/test-renderer|test-util|testing/.test(n)) return "test-harness";
  if (/eslint|lint/.test(n)) return "development-tooling";
  if (/refresh|hot/.test(n)) return "development-tooling";

  return "runtime-support";
}

/**
 * Infers a lightweight support role for non-center systems
 * where archetype or role hint is weak/missing. Returns undefined
 * when no role can be confidently inferred.
 */
export function inferSupportRole(
  system: MemorSystem,
  repoMode: RepoMode
): SupportRole | undefined {
  if (system.isRepoCenter) return undefined;
  if (system.systemRoleHint && system.systemRoleHint !== "unknown" && system.systemRoleHint !== "workflow-support-package") {
    return undefined;
  }
  // Primary runnable systems already have strong identity from type + archetype
  if (
    system.systemTier === "primary" &&
    system.runtimeRole === "runnable" &&
    (system.type === "web-app" || system.type === "api-service")
  ) {
    return undefined;
  }
  // Docs-site and infra systems have clear type-based identity
  if (system.type === "docs-site" || system.type === "infra") {
    return undefined;
  }

  const allScores = new Map<SupportRole, number>();
  const merge = (items: RoleScore[]) => {
    for (const { role, score } of items) {
      allScores.set(role, (allScores.get(role) || 0) + score);
    }
  };

  merge(scoreBlocks(system));
  merge(scoreName(system.name));

  // UI-dominant systems should never be classified as development-tooling
  const blockTypes = new Set(system.blocks.map(b => b.type));
  const isUISystem = blockTypes.has("ui-components") || blockTypes.has("hooks") ||
    system.packageArchetype === "ui-library";
  if (isUISystem) {
    allScores.delete("development-tooling");
  }

  for (const [role, base] of allScores) {
    const boost = repoModeBoost(role, repoMode);
    if (boost !== 0) allScores.set(role, base + boost);
  }

  const sorted = [...allScores.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    return frameworkPackageFallback(system, repoMode);
  }

  const [bestRole, bestScore] = sorted[0];
  if (bestScore < 0.4) {
    return frameworkPackageFallback(system, repoMode) ?? undefined;
  }

  if (sorted.length >= 2) {
    const gap = bestScore - sorted[1][1];
    if (gap < 0.1 && bestScore < 0.6) {
      return frameworkPackageFallback(system, repoMode) ?? undefined;
    }
  }

  return bestRole;
}
