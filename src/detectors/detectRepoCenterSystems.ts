import type { MemorSystem, RepoMode, SystemRoleHint } from "../types";

/**
 * Detects which system(s) form the center of gravity for the repo, and
 * assigns `isRepoCenter` + `systemRoleHint` to every system that benefits
 * from mode-aware classification.
 *
 * Mutates systems in place. Called after repo-mode detection and
 * consistency normalisation.
 */
export function detectRepoCenterSystems(
  systems: MemorSystem[],
  repoMode: RepoMode,
  repoName: string
): void {
  switch (repoMode) {
    case "framework-core":
      assignFrameworkHints(systems, repoName);
      break;
    case "library-tooling":
      assignLibraryCenter(systems, repoName);
      break;
    case "workflow-platform":
      assignWorkflowHints(systems, repoName);
      break;
    default:
      break;
  }
}

// ── framework-core ────────────────────────────────────────────────────

const FRAMEWORK_CORE_NAMES =
  /^(core|common|runtime|scheduler|compiler|reconciler|server|dom)$/i;

const FRAMEWORK_ADAPTER_RE =
  /^platform[-/]|^microservices$|^websockets$|^bindings$/i;

const FRAMEWORK_TOOLING_RE =
  /^(cli|testing|devtools|schematics|generator|scripts|compiler)$/i;

function assignFrameworkHints(systems: MemorSystem[], repoName: string): void {
  const rnFlat = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const s of systems) {
    const n = s.name.toLowerCase();
    const nFlat = n.replace(/[^a-z0-9]/g, "");

    if (
      FRAMEWORK_CORE_NAMES.test(n) ||
      nFlat === rnFlat ||
      nFlat === `${rnFlat}dom` ||
      nFlat === `${rnFlat}server` ||
      nFlat === `${rnFlat}reconciler`
    ) {
      s.systemRoleHint = "framework-core-package";
      s.isRepoCenter = true;
    } else if (FRAMEWORK_ADAPTER_RE.test(n)) {
      s.systemRoleHint = "framework-adapter-package";
    } else if (FRAMEWORK_TOOLING_RE.test(n)) {
      s.systemRoleHint = "framework-tooling-package";
    }
  }
}

// ── library-tooling ───────────────────────────────────────────────────

const LIBRARY_TOOLING_RE =
  /codemod|generator|devtools|scripts|^build$|codegen/i;

function assignLibraryCenter(systems: MemorSystem[], repoName: string): void {
  const rnFlat = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Score each candidate: higher = more likely the main library
  let best: MemorSystem | null = null;
  let bestScore = -1;

  for (const s of systems) {
    const nFlat = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");

    // Explicitly skip obvious tooling/support packages
    if (LIBRARY_TOOLING_RE.test(s.name)) continue;

    let score = s.blocks.length;

    // Strong name alignment with repo concept
    if (nFlat === rnFlat || rnFlat.includes(nFlat) || nFlat.includes(rnFlat)) {
      score += 40;
    }

    // Common main-library names
    if (/^(toolkit|core|main|library|sdk|client)$/i.test(s.name)) {
      score += 20;
    }

    // Already recognised as higher tier
    if (s.systemTier === "primary") score += 10;

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (best) {
    best.systemRoleHint = "primary-library-package";
    best.isRepoCenter = true;
    best.systemTier = "primary";
    best.importanceScore = Math.max(best.importanceScore, 0.9);
  }
}

// ── workflow-platform ─────────────────────────────────────────────────

const WORKFLOW_CORE_NAMES =
  /^(core|scheduler|executor|jobs|workflows|dags|operators)$/i;

const WORKFLOW_CORE_SUFFIX =
  /-(core|server|scheduler|executor)$/i;

const WORKFLOW_PROVIDER_RE =
  /^providers?$|^hooks$|^operators$|^connections$/i;

function assignWorkflowHints(systems: MemorSystem[], repoName: string): void {
  const rnFlat = repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  let foundCenter = false;

  for (const s of systems) {
    const n = s.name.toLowerCase();
    const nFlat = n.replace(/[^a-z0-9]/g, "");

    if (
      WORKFLOW_CORE_NAMES.test(n) ||
      WORKFLOW_CORE_SUFFIX.test(n) ||
      nFlat === rnFlat
    ) {
      s.systemRoleHint = "workflow-core-package";
      s.isRepoCenter = true;
      s.systemTier = "primary";
      s.importanceScore = Math.max(s.importanceScore, 0.88);
      foundCenter = true;
    } else if (WORKFLOW_PROVIDER_RE.test(n)) {
      s.systemRoleHint = "workflow-provider-package";
    } else {
      s.systemRoleHint = "workflow-support-package";
    }
  }

  // Fallback: pick the system with the most blocks if no center was found
  if (!foundCenter && systems.length) {
    const biggest = systems.reduce((a, b) =>
      b.blocks.length > a.blocks.length ? b : a
    );
    biggest.systemRoleHint = "workflow-core-package";
    biggest.isRepoCenter = true;
    biggest.systemTier = "primary";
    biggest.importanceScore = Math.max(biggest.importanceScore, 0.88);
  }
}
