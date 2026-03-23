import type { RepoAnalysis } from "../types";
import type { RepoStory, RepoFlowSummary, ReadingStepSummary, KeyCoupling } from "./generateRepoStory";
import type { ChangeImpactResult } from "./analyzeChangeImpact";

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

export function generateAhaSummary(
  analysis: RepoAnalysis,
  story: RepoStory,
  impactResults?: Record<string, ChangeImpactResult>
): AhaSummary {
  const { systems, repoMode, repoName } = analysis;

  // Find highest-risk system
  let highestRisk: { name: string; score: number; level: string } | undefined;
  if (impactResults) {
    for (const [, impact] of Object.entries(impactResults)) {
      if (!highestRisk || impact.blastRadiusScore > highestRisk.score) {
        highestRisk = {
          name: impact.selectedSystem,
          score: impact.blastRadiusScore,
          level: impact.blastRadiusLevel,
        };
      }
    }
  }

  const strongCouplings = story.keyCouplings.filter(
    (c) => c.strength === "high" || c.strength === "medium"
  ).length;

  const glance: AhaGlance = {
    repoType: story.repoType,
    systems: systems.length,
    zones: story.zones.length,
    flows: story.flows.length,
    strongCouplings,
    highestRiskSystem: highestRisk?.name,
    highestRiskScore: highestRisk?.score,
    highestRiskLevel: highestRisk?.level,
  };

  const headline = buildHeadline(repoName, repoMode, story, analysis);
  const subheadline = buildSubheadline(story);
  const bullets = buildBullets(story, highestRisk);
  const warnings = buildWarnings(story, highestRisk, strongCouplings);

  return { headline, subheadline, bullets, warnings, glance };
}

function buildHeadline(
  repoName: string,
  repoMode: string,
  story: RepoStory,
  analysis: RepoAnalysis
): string {
  const zoneNames = story.zones.slice(0, 3).map((z) => z.name.toLowerCase());
  const zoneList = zoneNames.join(", ");

  if (repoMode === "product-web-app") {
    return `${repoName} is a product web app built around ${zoneList}.`;
  }
  if (repoMode === "framework-core") {
    return `${repoName} is a framework core centered on ${zoneList}.`;
  }
  if (repoMode === "library-tooling") {
    return `${repoName} is a library with supporting tooling and auxiliary packages.`;
  }
  if (repoMode === "surface-platform") {
    return `${repoName} is a multi-surface platform spanning ${zoneList}.`;
  }
  if (repoMode === "product-domain-machine") {
    const runnables = analysis.systems
      .filter((s) => s.runtimeRole === "runnable")
      .map((s) => s.name)
      .slice(0, 3);
    const shared = analysis.systems.filter((s) => s.runtimeRole === "consumable").length;
    const appList = runnables.join(", ");
    return `${repoName} is a product monorepo with ${appList} backed by ${shared} shared packages.`;
  }
  if (repoMode === "workflow-platform") {
    return `${repoName} is a workflow platform orchestrating pipelines and tasks.`;
  }

  // unknown fallback — derive from system composition
  const runnables = analysis.systems.filter((s) => s.runtimeRole === "runnable");
  const shared = analysis.systems.filter((s) => s.runtimeRole === "consumable").length;
  if (runnables.length > 0) {
    const appNames = runnables.slice(0, 3).map((s) => s.name).join(", ");
    return `${repoName} is a monorepo with ${appNames} and ${shared} shared packages across ${story.zones.length} zones.`;
  }
  return `${repoName} is a ${story.repoType.toLowerCase()} with ${analysis.systems.length} systems across ${story.zones.length} zones.`;
}

function buildSubheadline(story: RepoStory): string {
  const startFile = story.recommendedStart;
  const mainFlow = story.flows[0];

  if (mainFlow) {
    const firstStep = mainFlow.steps[0]?.label?.toLowerCase() ?? "the entry";
    return `Start at ${shortPath(startFile)}, then follow the ${firstStep} path inward.`;
  }
  return `Start at ${shortPath(startFile)} to understand the architecture.`;
}

function shortPath(p: string): string {
  if (!p) return "the entry";
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return parts.slice(-2).join("/");
}

function buildBullets(
  story: RepoStory,
  highestRisk?: { name: string; score: number; level: string }
): string[] {
  const bullets: string[] = [];

  if (story.recommendedStart) {
    bullets.push(`Begin at ${shortPath(story.recommendedStart)} — ${story.startReason || "the main entry point."}`);
  }

  if (story.flows[0]) {
    const f = story.flows[0];
    const steps = f.steps.map((s) => s.label).join(" → ");
    bullets.push(`Main flow: ${steps}`);
  }

  if (story.keyCouplings[0]) {
    const c = story.keyCouplings[0];
    bullets.push(`Strongest coupling: ${c.from} ↔ ${c.to} (${c.strength}).`);
  }

  if (highestRisk && highestRisk.score >= 30) {
    bullets.push(`Riskiest system: ${highestRisk.name} — blast radius ${highestRisk.score}/100 (${highestRisk.level}).`);
  }

  return bullets.slice(0, 4);
}

function buildWarnings(
  story: RepoStory,
  highestRisk?: { name: string; score: number; level: string },
  strongCouplings?: number
): string[] {
  const warnings: string[] = [];

  if (highestRisk && highestRisk.score >= 60) {
    warnings.push(
      `${highestRisk.name} has ${highestRisk.level} blast radius (${highestRisk.score}/100) — changes propagate widely.`
    );
  }

  if (strongCouplings && strongCouplings >= 8) {
    warnings.push(
      `${strongCouplings} strong couplings detected — this architecture has dense interconnection.`
    );
  }

  const apiZone = story.zones.find((z) => /api|bff/i.test(z.name));
  if (apiZone) {
    warnings.push(
      `The ${apiZone.name} is a central bottleneck — changes here affect most surfaces.`
    );
  }

  return warnings.slice(0, 3);
}
