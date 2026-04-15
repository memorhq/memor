import type { MemorSystem, RepoAnalysis, RepoMode, RepoSummary } from "../types";

type ModeResult = {
  mode: RepoMode;
  confidence: number;
};

function countBy<T>(arr: T[], pred: (t: T) => boolean): number {
  let n = 0;
  for (const x of arr) if (pred(x)) n++;
  return n;
}

function uniqueAppArchetypes(systems: MemorSystem[]): number {
  const set = new Set<string>();
  for (const s of systems) {
    if (s.appArchetype && s.appArchetype !== "unknown") set.add(s.appArchetype);
  }
  return set.size;
}

function allNames(systems: MemorSystem[]): string {
  return systems
    .map((s) => s.name.toLowerCase())
    .join(" ");
}

function allPackageArchetypes(systems: MemorSystem[]): string[] {
  return systems
    .filter((s) => s.packageArchetype && s.packageArchetype !== "unknown")
    .map((s) => s.packageArchetype!);
}

function allBlocks(systems: MemorSystem[]): string {
  return systems
    .flatMap((s) => s.blocks.map((b) => `${b.name} ${b.type}`))
    .join(" ")
    .toLowerCase();
}

function allTags(systems: MemorSystem[]): string {
  return systems.flatMap((s) => s.tags).join(" ").toLowerCase();
}

/**
 * Detect the high-level character of the repository based on system
 * distribution, naming patterns, and structural signals.
 */
export function detectRepoMode(
  analysis: Pick<RepoAnalysis, "repoName" | "systems" | "summary">
): ModeResult {
  const { systems, summary, repoName } = analysis;
  const n = systems.length;

  if (n === 0) return { mode: "unknown", confidence: 0.3 };

  const repoNameLow = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Single-package framework detection (e.g., Svelte, Vue)
  const realPackages = systems.filter((s) => s.type !== "support-system");
  if (realPackages.length <= 2 && realPackages.length >= 1) {
    const main = realPackages[0];
    const hasCompiler = systems.some(
      (s) => /compiler/i.test(s.name) || /compiler/i.test(s.rootPath)
    );
    const hasRichInternals =
      main.internalStructure && main.internalStructure.zones.length >= 4;
    const hasRichSubsystems =
      main.subsystems && main.subsystems.length >= 4;
    const hasRichBlocks = main.blocks.length >= 3;
    const nameMatchesRepo =
      main.name.toLowerCase().replace(/[^a-z0-9]/g, "") === repoNameLow;
    const noRunnable = countBy(systems, (s) => s.runtimeRole === "runnable") === 0;

    // Exclude web-app pattern: a package with both a server zone AND a client zone is
    // a full-stack web app, not a framework (e.g. test-coverage-ui with server/ + client/)
    const zones = main.internalStructure?.zones ?? [];
    const hasServerZone = zones.some((z) => /^server$/i.test(z.label));
    const hasClientZone = zones.some((z) => /^client$/i.test(z.label));
    const isWebAppPattern = hasServerZone && hasClientZone;

    // Also exclude test/coverage tooling repos from framework-core classification
    const isTestHarness = /test|coverage|cypress|playwright|jest|vitest/i.test(repoNameLow);

    if (
      (hasCompiler || hasRichInternals || hasRichSubsystems || hasRichBlocks) &&
      nameMatchesRepo &&
      noRunnable &&
      !isWebAppPattern &&
      !isTestHarness
    ) {
      return { mode: "framework-core", confidence: 0.75 };
    }
  }

  const scores: Record<RepoMode, number> = {
    "surface-platform": 0,
    "product-domain-machine": 0,
    "framework-core": 0,
    "library-tooling": 0,
    "workflow-platform": 0,
    "product-web-app": 0,
    unknown: 0,
  };

  const primaryCount = countBy(systems, (s) => s.systemTier === "primary");
  const runnableCount = countBy(systems, (s) => s.runtimeRole === "runnable");
  const consumableCount = countBy(systems, (s) => s.runtimeRole === "consumable");
  const webAppCount = countBy(systems, (s) => s.type === "web-app");
  const apiCount = countBy(systems, (s) => s.type === "api-service");
  const sharedPkgCount = countBy(systems, (s) => s.type === "shared-package");
  const uiLibCount = countBy(systems, (s) => s.type === "ui-library");
  const workerCount = countBy(systems, (s) => s.type === "worker");
  const isMonorepo = summary.detectedRepoStyle === "monorepo";
  const nameBlob = allNames(systems);
  const repoNameL = repoName.toLowerCase();
  const blockBlob = allBlocks(systems);
  const tagBlob = allTags(systems);
  const uArchetypes = uniqueAppArchetypes(systems);
  const pkgArchetypes = allPackageArchetypes(systems);

  // ── surface-platform ──────────────────────────────────────────────
  // Multiple distinct runnable surfaces under apps/ with varied archetypes
  if (runnableCount >= 3 && uArchetypes >= 2) {
    scores["surface-platform"] += 0.52;
  }
  if (runnableCount >= 2 && uArchetypes >= 3) {
    scores["surface-platform"] += 0.18;
  }
  if (
    isMonorepo &&
    webAppCount >= 3 &&
    systems.some(
      (s) => s.appArchetype === "docs-app" || s.appArchetype === "admin-app"
    )
  ) {
    scores["surface-platform"] += 0.14;
  }
  // Multiple surfaces + many shared packages, even if all surfaces have the same archetype
  // (e.g., design-system monorepos with 5+ identical web-apps all backed by UI packages)
  if (runnableCount >= 3 && sharedPkgCount >= 5) {
    scores["surface-platform"] += 0.44;
  }

  // ── product-domain-machine ────────────────────────────────────────
  // 1–4 runnable systems (web + api + desktop, etc.), many shared packages for domain logic
  if (runnableCount >= 1 && runnableCount <= 4 && sharedPkgCount >= 3) {
    scores["product-domain-machine"] += 0.42;
  }
  if (webAppCount >= 1 && apiCount >= 1 && sharedPkgCount >= 4) {
    scores["product-domain-machine"] += 0.22;
  }
  if (runnableCount >= 2 && apiCount >= 1 && sharedPkgCount >= 8 && isMonorepo) {
    scores["product-domain-machine"] += 0.18;
  }
  if (
    runnableCount <= 4 &&
    pkgArchetypes.some((a) =>
      ["feature-package", "database-package", "integration-package"].includes(a)
    )
  ) {
    scores["product-domain-machine"] += 0.12;
  }
  if (n >= 8 && runnableCount <= 4 && isMonorepo) {
    scores["product-domain-machine"] += 0.08;
  }

  // ── framework-core ────────────────────────────────────────────────
  // Many packages, no/few runnable, core/runtime/platform naming
  const fewRunnable = runnableCount <= 2 && runnableCount < n * 0.1;
  if ((runnableCount === 0 || fewRunnable) && sharedPkgCount >= 8) {
    scores["framework-core"] += 0.44;
  }
  if ((runnableCount === 0 || fewRunnable) && consumableCount >= 12) {
    scores["framework-core"] += 0.16;
  }
  const coreNames =
    /\b(core|runtime|reconciler|scheduler|renderer|compiler|platform-|common)\b/;
  if (coreNames.test(nameBlob) && (runnableCount === 0 || fewRunnable) && n >= 6) {
    scores["framework-core"] += 0.2;
  }
  if (
    isMonorepo &&
    (runnableCount === 0 || fewRunnable) &&
    apiCount >= 2 &&
    n >= 5 &&
    coreNames.test(nameBlob)
  ) {
    scores["framework-core"] += 0.32;
  }
  // Strong signal: overwhelming ratio of shared/consumable to runnable
  if (sharedPkgCount >= 15 && runnableCount <= 2) {
    scores["framework-core"] += 0.22;
  }
  if (isMonorepo && n >= 15 && sharedPkgCount >= 12 && runnableCount <= 2) {
    scores["framework-core"] += 0.10;
  }

  // ── library-tooling ───────────────────────────────────────────────
  // Smaller package graph, codegen/cli/utils shape, no/few runnable apps
  // Include api-service packages that have library-code blocks (e.g., express itself)
  const backendLibCount = countBy(systems, (s) =>
    s.type === "api-service" &&
    s.blocks.some((b) => b.type === "library-code")
  );
  const consumableLibCount = sharedPkgCount + backendLibCount;
  if (runnableCount === 0 && n >= 1 && n <= 10 && sharedPkgCount >= 1) {
    scores["library-tooling"] += 0.3;
  }
  // Single backend library (e.g., express/koa/fastify as the package itself)
  if (n === 1 && backendLibCount === 1) {
    scores["library-tooling"] += 0.45;
  }
  if (/\b(codegen|codemods?|query|cli|toolkit|utils?)\b/.test(nameBlob)) {
    scores["library-tooling"] += 0.2;
  }
  if (
    runnableCount === 0 &&
    n <= 6 &&
    pkgArchetypes.filter((a) => a === "tooling-package").length >= 1
  ) {
    scores["library-tooling"] += 0.14;
  }
  // Penalize library-tooling if there are too many packages (that's framework territory)
  if (n > 12) {
    scores["library-tooling"] -= 0.18;
  }
  // Large UI component library monorepos: many ui-library packages → library-tooling, not framework-core.
  // These have no runnable apps, just many small React/Vue component packages (Storybook-driven).
  if (uiLibCount >= 5 && runnableCount === 0) {
    scores["library-tooling"] += 0.5;
    scores["framework-core"] *= 0.45;
  }

  // ── workflow-platform ─────────────────────────────────────────────
  // DAGs, workflows, providers, operators, scheduler/executor signals
  const workflowSignals =
    /\b(dag|dags|workflow|workflows|pipeline|pipelines|operator|operators|provider|providers|executor|executors|scheduler)\b/;
  if (
    workflowSignals.test(repoNameL) ||
    workflowSignals.test(nameBlob) ||
    workflowSignals.test(blockBlob) ||
    workflowSignals.test(tagBlob)
  ) {
    scores["workflow-platform"] += 0.54;
  }
  if (workerCount >= 1 || /\b(jobs|queues|consumers|processors)\b/.test(nameBlob)) {
    scores["workflow-platform"] += 0.14;
  }
  if (/\b(providers|operators)\b/.test(nameBlob) && n <= 3) {
    scores["workflow-platform"] += 0.16;
  }

  // ── product-web-app ─────────────────────────────────────────────
  // Single-app web repos: one runnable web app, possibly with BFF/API routes
  if (n <= 3 && webAppCount >= 1 && runnableCount >= 1) {
    const blocksStr = blockBlob;
    const hasRoutes = /\broutes\b|\bpages?\b/.test(blocksStr);
    const hasUI = /\bui.components?\b|\bcomponents?\b/.test(blocksStr);
    const hasApi = /\bapi.layer\b|\bapi\b|\bserver.code\b/.test(blocksStr);
    const techBlob = systems.map((s) => (s.detectedTech || []).join(" ")).join(" ").toLowerCase();
    const hasWebFramework = /next|nuxt|remix|sveltekit/i.test(tagBlob + " " + techBlob);

    if (hasWebFramework && (hasRoutes || hasUI)) {
      scores["product-web-app"] += 0.55;
      if (hasApi) scores["product-web-app"] += 0.15;
      if (hasUI && hasRoutes) scores["product-web-app"] += 0.10;
    }

    // Strong signal: a single web-app system with Next.js/Nuxt/Remix detected tech
    // is almost always a product web app, even without route blocks (they may be nested in src/)
    if (hasWebFramework && !hasRoutes && !hasUI) {
      scores["product-web-app"] += 0.52;
    }

    // Fallback: if the single system has Next.js and route blocks, it's likely a web app
    if (!hasWebFramework && hasRoutes && systems.some((s) =>
      (s.detectedTech || []).some((t) => /next|nuxt|remix/i.test(t))
    )) {
      scores["product-web-app"] += 0.50;
    }
  }

  // ── Pick winner ───────────────────────────────────────────────────
  let best: RepoMode = "unknown";
  let bestV = 0.38; // threshold: must clear this to not be unknown
  for (const [k, v] of Object.entries(scores) as [RepoMode, number][]) {
    if (k === "unknown") continue;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }

  return { mode: best, confidence: Math.min(0.85, bestV) };
}

// ── Center of gravity ─────────────────────────────────────────────────

const CENTER_SENTENCES: Record<RepoMode, string> = {
  "surface-platform":
    "Multi-surface platform composed of multiple user-facing applications.",
  "product-domain-machine":
    "Product system centered around core domain workflows and business logic.",
  "framework-core":
    "Framework core composed of modular runtime and extension packages.",
  "library-tooling":
    "Primary library with supporting tooling and auxiliary packages.",
  "workflow-platform":
    "Workflow orchestration system composed of pipelines, tasks, and execution components.",
  "product-web-app":
    "Product web application with internal architectural surfaces, data layers, and UI.",
  unknown:
    "Repository structure did not match a clear high-level pattern.",
};

export function deriveRepoCenter(mode: RepoMode): string {
  return CENTER_SENTENCES[mode];
}

// ── Narrative ─────────────────────────────────────────────────────────

export function buildRepoNarrative(
  analysis: Pick<RepoAnalysis, "repoName" | "systems" | "summary">,
  mode: RepoMode
): string {
  const { repoName, systems, summary } = analysis;
  const n = systems.length;
  const style = summary.detectedRepoStyle;

  const primaries = systems.filter((s) => s.systemTier === "primary");
  const primaryNames = primaries.slice(0, 3).map((s) => s.name);
  const dominantTech = detectDominantTech(systems);
  const techPhrase = dominantTech ? `built with ${dominantTech}` : "";

  if (mode === "surface-platform") {
    const surfaces = systems
      .filter((s) => s.runtimeRole === "runnable")
      .map((s) => s.name)
      .slice(0, 4);
    const shared = systems.filter((s) => s.runtimeRole === "consumable");
    const sharedNames = shared.slice(0, 2).map((s) => s.name);
    return (
      `${repoName} is a multi-surface platform with ${surfaces.length} apps (${surfaces.join(", ")})` +
      (sharedNames.length > 0 ? `, backed by shared packages like ${sharedNames.join(" and ")}` : "") +
      `. ` +
      (techPhrase ? `${capitalize(techPhrase)}. ` : "") +
      `Each app serves a different audience, sharing common logic underneath.`
    );
  }

  if (mode === "product-domain-machine") {
    const runnables = systems
      .filter((s) => s.runtimeRole === "runnable")
      .map((s) => s.name)
      .slice(0, 3);
    const shared = systems.filter((s) => s.runtimeRole === "consumable").slice(0, 2).map((s) => s.name);
    const runDesc = runnables.length ? runnables.join(", ") : "its core apps";
    return (
      `${repoName} is a product monorepo${techPhrase ? ` ${techPhrase}` : ""}, ` +
      `centered on ${runDesc}` +
      (shared.length > 0 ? ` with shared packages like ${shared.join(" and ")}` : "") +
      `. ${n} packages total.`
    );
  }

  if (mode === "framework-core") {
    const center = systems.find((s) => s.isRepoCenter);
    const adapters = systems.filter((s) =>
      /adapter|platform|binding/i.test(s.name) || s.inferredSupportRole === "adapter-bridge"
    ).slice(0, 3).map((s) => s.name);
    return (
      `${repoName} is ${techPhrase ? `a framework ${techPhrase}` : "a framework"} with ${n} packages` +
      (center ? `, centered on ${center.name}` : "") +
      (adapters.length > 0 ? `. Platform adapters: ${adapters.join(", ")}` : "") +
      `. ` +
      (style === "monorepo"
        ? `Organized as a monorepo for unified development.`
        : `Packages are developed together for external consumption.`)
    );
  }

  if (mode === "library-tooling") {
    const main = primaries[0];
    const mainDesc = main
      ? `${main.name}${main.packageDescription ? ` — ${main.packageDescription}` : ""}`
      : repoName;
    return (
      `${repoName} is a library${techPhrase ? ` ${techPhrase}` : ""}. ` +
      `Primary package: ${mainDesc}. ` +
      (n > 1 ? `${n - 1} supporting package${n > 2 ? "s" : ""} for tooling and utilities.` : "")
    );
  }

  if (mode === "product-web-app") {
    const blocks = systems.flatMap((s) => s.blocks.map((b) => b.type));
    const hasRoutes = blocks.includes("routes");
    const hasApi = blocks.includes("api-layer") || blocks.includes("services");
    const hasDB = blocks.includes("database");
    const layers: string[] = [];
    if (hasRoutes) layers.push("routes");
    if (hasApi) layers.push("API layer");
    if (hasDB) layers.push("data access");
    const layerPhrase = layers.length > 0 ? ` with ${layers.join(", ")}` : "";
    return (
      `${repoName} is a web application${techPhrase ? ` ${techPhrase}` : ""}${layerPhrase}. ` +
      `${n} internal module${n !== 1 ? "s" : ""} form the application architecture.`
    );
  }

  if (mode === "workflow-platform") {
    const coreNames = primaries.map((s) => s.name).slice(0, 2);
    return (
      `${repoName} is a workflow platform${techPhrase ? ` ${techPhrase}` : ""}` +
      (coreNames.length > 0 ? `, centered on ${coreNames.join(" and ")}` : "") +
      `. Structured around task scheduling, execution, and orchestration across ${n} packages.`
    );
  }

  // Unknown mode — still try to be specific based on dominant system type
  const infraCount = systems.filter((s) => s.type === "infra").length;
  const docsCount = systems.filter((s) => s.type === "docs-site").length;
  // Stricter test detection: name must START with or END with test/spec/e2e keywords.
  // Exclude api-service and web-app systems — they're apps that happen to have tests, not test suites.
  const testCount = systems.filter(
    (s) =>
      s.type !== "api-service" && s.type !== "web-app" &&
      /^(tests?|specs?|e2e|cypress|playwright)[-_.]|[-_.](tests?|specs?|e2e)$|^(tests?|specs?|e2e)$|[-_](tests?|e2e)$/i.test(s.name)
  ).length;

  if (infraCount === n || (infraCount >= 1 && n <= 2)) {
    return `${repoName} is an infrastructure repository${techPhrase ? `, ${techPhrase}` : ""} — Terraform, Docker, or cloud configuration. Use the Structure view to explore resource definitions.`;
  }
  if (docsCount >= 1 && n <= 2) {
    return `${repoName} is a documentation site${techPhrase ? `, ${techPhrase}` : ""}. Use the Structure view to explore content organization.`;
  }
  if (testCount >= 1 && n <= 3) {
    return `${repoName} is a test suite${techPhrase ? `, ${techPhrase}` : ""}. Use the Structure view to explore test organization and coverage.`;
  }

  const rn = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const distinctPrimaries = primaryNames.filter(
    (p) => p.toLowerCase().replace(/[^a-z0-9]/g, "") !== rn
  );
  if (distinctPrimaries.length > 0) {
    return (
      `${repoName}${techPhrase ? ` is ${techPhrase}` : ""} with ${n} modules` +
      `, centered on ${distinctPrimaries.join(", ")}. ` +
      `Architecture pattern could not be confidently classified.`
    );
  }
  return (
    `${repoName} contains ${n} detected module${n !== 1 ? "s" : ""}${techPhrase ? `, ${techPhrase}` : ""}. ` +
    `Structure is flat or unconventional — use Structure and Impact views for detail.`
  );
}

function detectDominantTech(systems: MemorSystem[]): string | null {
  const counts = new Map<string, number>();
  for (const s of systems) {
    for (const t of s.detectedTech || []) {
      if (/^(TypeScript|JavaScript)$/i.test(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const lang = systems.some((s) => s.detectedTech?.includes("TypeScript")) ? "TypeScript" : "JavaScript";
  if (sorted.length === 0) return lang;
  const top = sorted.slice(0, 2).map(([t]) => t);
  return `${lang} and ${top.join(", ")}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
