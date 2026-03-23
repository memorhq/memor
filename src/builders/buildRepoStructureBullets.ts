import type { RepoAnalysis } from "../types";

const MODE_LABELS: Record<string, string> = {
  "surface-platform": "a multi-surface application platform",
  "product-domain-machine": "a product-focused domain system",
  "framework-core": "a framework-core monorepo",
  "library-tooling": "a library-centric repository with tooling",
  "workflow-platform": "a workflow or orchestration platform",
  "product-web-app": "a product web application",
};

const ECOSYSTEM_BLOCKS = new Set([
  "providers", "operators", "adapters", "plugins",
  "workflows", "tasks", "transport", "orchestration", "sdks",
]);

/**
 * Generates 4–6 deterministic structural bullets from existing analysis fields.
 * No speculative prose — only facts derived from system metadata.
 */
export function buildRepoStructureBullets(analysis: RepoAnalysis): string[] {
  const { systems, repoMode, summary } = analysis;
  const bullets: string[] = [];

  // 1. Repo mode
  const modeLabel = MODE_LABELS[repoMode];
  if (modeLabel) {
    const style = summary.detectedRepoStyle;
    const styleNote = style === "monorepo" ? " (monorepo)" : style === "multi-system" ? " (multi-system)" : "";
    bullets.push(`This repo is structured as ${modeLabel}${styleNote}.`);
  }

  // 2. Repo centers
  const centers = systems.filter((s) => s.isRepoCenter);
  if (centers.length === 1) {
    bullets.push(`Memor identified \`${centers[0].name}\` as the primary repo center.`);
  } else if (centers.length > 1) {
    const names = centers.slice(0, 4).map((s) => `\`${s.name}\``).join(", ");
    bullets.push(`Memor identified ${centers.length} repo-center systems: ${names}.`);
  }

  // 2b. Multi-surface repos with no single center
  if (centers.length === 0) {
    const primaryCount = systems.filter((s) => s.systemTier === "primary").length;
    if (primaryCount >= 2) {
      bullets.push(
        "This repo has multiple primary surfaces rather than a single architectural center."
      );
    }
  }

  // 3. Primary runnable systems
  const runnables = systems.filter(
    (s) => s.runtimeRole === "runnable" && s.systemTier === "primary"
  );
  if (runnables.length === 1) {
    bullets.push(`The main runnable surface is \`${runnables[0].name}\`.`);
  } else if (runnables.length > 1) {
    const names = runnables.slice(0, 4).map((s) => `\`${s.name}\``).join(", ");
    bullets.push(`${runnables.length} runnable application surfaces detected: ${names}.`);
  }

  // 4. Ecosystem block presence
  const ecoTypes = new Set<string>();
  for (const s of systems) {
    for (const b of s.blocks) {
      if (ECOSYSTEM_BLOCKS.has(b.type)) ecoTypes.add(b.type);
    }
  }
  if (ecoTypes.size > 0) {
    const labels = [...ecoTypes].sort().join(", ");
    bullets.push(`Ecosystem-level modules present: ${labels}.`);
  }

  // 5. Adapter / integration separation from core (framework repos)
  const adapters = systems.filter(
    (s) => s.systemRoleHint === "framework-adapter-package"
  );
  if (adapters.length > 0) {
    bullets.push(
      `${adapters.length} adapter/platform binding package(s) are separated from the framework core.`
    );
  }

  // 6. Mixed / intentionally unlabeled systems
  const mixed = systems.filter(
    (s) =>
      !s.packageArchetype &&
      !s.appArchetype &&
      !s.systemRoleHint &&
      s.type !== "web-app" &&
      s.type !== "api-service" &&
      s.type !== "docs-site" &&
      s.type !== "worker" &&
      s.type !== "infra" &&
      s.blocks.length >= 2
  );
  if (mixed.length > 0) {
    bullets.push(
      `${mixed.length} system(s) remain intentionally unlabeled due to mixed or ambiguous signals.`
    );
  }

  return bullets.slice(0, 6);
}
