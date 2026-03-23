import type { MemorSystem, RepoMode } from "../types";

/**
 * Names that strongly signal a framework package (adapter, platform binding,
 * or core module) rather than a standalone runnable API service.
 */
const FRAMEWORK_PACKAGE_NAMES =
  /^(core|common|compiler|cli|runtime|shared|bindings|adapters|renderer|reconciler|scheduler|server|dom)$/i;

const FRAMEWORK_ADAPTER_NAMES =
  /^(platform-|microservices|websockets|testing|devtools|schematics)|\bplatform[-/]/i;

const FRAMEWORK_TOOLING_NAMES =
  /^(cli|schematics|devtools|testing|compiler|generator|scripts)$/i;

/**
 * After repo-mode detection, normalise system types that contradict the
 * repo-level classification. Focuses on framework-core repos where JS/TS
 * framework detection (NestJS, etc.) incorrectly promotes consumable
 * packages to `api-service`.
 *
 * Mutates systems in place.
 */
export function applyRepoModeConsistency(
  systems: MemorSystem[],
  repoMode: RepoMode
): void {
  if (repoMode === "framework-core") {
    applyFrameworkCoreConsistency(systems);
  }
}

function hasStrongRunnableEvidence(system: MemorSystem): boolean {
  if (system.runtimeRole === "runnable") return true;
  const hasRoutes = system.blocks.some((b) => b.type === "routes");
  const hasDb = system.blocks.some((b) => b.type === "database");
  const hasFeatures = system.blocks.some((b) => b.type === "features");
  return hasRoutes && (hasDb || hasFeatures);
}

function applyFrameworkCoreConsistency(systems: MemorSystem[]): void {
  for (const s of systems) {
    if (s.type !== "api-service" && s.type !== "web-app") continue;
    if (hasStrongRunnableEvidence(s)) continue;

    const n = s.name.toLowerCase();
    const isFrameworkShape =
      FRAMEWORK_PACKAGE_NAMES.test(n) ||
      FRAMEWORK_ADAPTER_NAMES.test(n) ||
      s.runtimeRole === "consumable";

    if (!isFrameworkShape) continue;

    s.type = "shared-package";

    if (s.entryPoints.length) {
      for (const ep of s.entryPoints) {
        if (ep.kind === "api") ep.kind = "library";
      }
    }
  }
}
