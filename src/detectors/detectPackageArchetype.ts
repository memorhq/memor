import type { MemorSystem, PackageArchetype } from "../types";

type Ctx = { candidateName: string };

function scoreMap(): Map<PackageArchetype, number> {
  return new Map();
}

/**
 * Secondary semantic label for packages and non-primary surfaces — conservative scoring.
 */
export function detectPackageArchetype(
  system: MemorSystem,
  ctx: Ctx
): PackageArchetype | undefined {
  if (
    system.systemTier === "primary" &&
    (system.type === "web-app" ||
      system.type === "api-service" ||
      system.type === "docs-site" ||
      system.type === "worker")
  ) {
    return undefined;
  }

  // Primary library packages marked as repo center shouldn't default to tooling
  if (system.isRepoCenter && system.systemRoleHint === "primary-library-package") {
    return undefined;
  }

  const n = ctx.candidateName.toLowerCase();
  const blockTypes = new Set(system.blocks.map((b) => b.type));
  const s = scoreMap();

  const add = (a: PackageArchetype, v: number) => {
    s.set(a, (s.get(a) || 0) + v);
  };

  // Name-match signals are the strongest evidence (high scores).
  // Block-only signals are weaker (lower scores) since a single block
  // doesn't define a package's purpose.

  const nameIsDb =
    /prisma|drizzle|^db$|database|(^|[-/])migrations?($|[-/])|(^|[-/])orm($|[-/])/.test(n);
  if (nameIsDb) add("database-package", 0.88);
  else if (blockTypes.has("database") || blockTypes.has("database-migrations"))
    add("database-package", 0.6);

  const nameIsUi =
    /(^|[-/])(ui|components|design)([-/]|$)|design-system|^ds$/.test(n);
  if (nameIsUi) {
    add("ui-library", 0.82);
  } else if (blockTypes.has("ui-components") || blockTypes.has("embeddable-components")) {
    // Block-only UI signal — weaker, and suppressed by competing server/api evidence
    const hasServerSignal =
      blockTypes.has("server-code") ||
      blockTypes.has("api-layer") ||
      blockTypes.has("services") ||
      blockTypes.has("database");
    add("ui-library", hasServerSignal ? 0.42 : 0.62);
  }

  const nameIsConfig =
    /^tsconfig$|^tsconfig-|eslint-config|@eslint|prettier|tailwind.*config|postcss|babel\.config|jest\.config|vitest\.config|commitlint|lint-staged|^config(s)?$/.test(n);
  if (nameIsConfig) {
    add("config-package", 0.86);
  } else if (blockTypes.has("config")) {
    // A config folder alone is not enough to label the package as config-package
    add("config-package", 0.38);
  }

  if (/(^|[-/])types($|[-/])|typings|typedefs/.test(n)) {
    add("types-package", 0.8);
  } else if (blockTypes.has("type-definitions")) {
    add("types-package", 0.55);
  }

  const nameIsIntegration =
    /^integration(s)?$|^adapters?$|^app-store$|^stripe$|^oauth$|^webhook(s)?$/.test(n);
  const nameIsConnective =
    /^trpc$|^grpc$|^rpc$|^graphql$|^api-client$|^transport$|^gateway$/.test(n);
  if (nameIsIntegration || nameIsConnective) {
    add("integration-package", 0.78);
  } else if (
    /providers|adapters/.test(n) ||
    blockTypes.has("integrations") ||
    blockTypes.has("providers") ||
    blockTypes.has("adapters") ||
    blockTypes.has("transport")
  ) {
    add("integration-package", 0.58);
  }

  if (/i18n|locale|locales|translations|intl|l10n/.test(n)) {
    add("localization-package", 0.78);
  } else if (blockTypes.has("localization")) {
    add("localization-package", 0.6);
  }

  if (/email|emails|smtp|mailer|postmark|sendgrid/.test(n)) {
    add("email-package", 0.8);
  } else if (blockTypes.has("email-module")) {
    add("email-package", 0.6);
  }

  if (/embed|embeds|widget|widgets|iframe/.test(n)) {
    add("embeddable-package", 0.76);
  } else if (blockTypes.has("embeddable-components")) {
    add("embeddable-package", 0.58);
  }

  if (/^platform$|^core$|[-/]platform$|platform-|[-/]core$/.test(n)) {
    add("platform-package", 0.78);
  }

  // Feature-package: strong name match should win over incidental block signals
  if (/^feature(s)?$|^modules?$|^domains?$|[-/]features$/.test(n)) {
    add("feature-package", 0.8);
  } else if (blockTypes.has("features")) {
    add("feature-package", 0.52);
  }

  if (/^docs$|documentation|guidebook/.test(n)) {
    add("documentation-package", 0.7);
  } else if (blockTypes.has("docs")) {
    add("documentation-package", 0.5);
  }

  if (/util|utils|helpers|shared-lib|core-util/.test(n)) {
    add("utility-package", 0.62);
  } else if (blockTypes.has("utilities")) {
    add("utility-package", 0.48);
  }

  if (/tooling|devtools|build-tools|scripts-only|^build$/.test(n)) {
    add("tooling-package", 0.65);
  } else if (blockTypes.has("scripts")) {
    add("tooling-package", 0.45);
  }

  // Winner selection with conflict awareness
  const entries = [...s.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return undefined;

  const [bestType, bestScore] = entries[0];
  if (bestScore <= 0.52) return undefined;

  // If the top two candidates are very close, prefer unknown to avoid
  // a false-confident label
  if (entries.length >= 2) {
    const gap = bestScore - entries[1][1];
    if (gap < 0.08 && bestScore < 0.7) return undefined;
  }

  return bestType;
}
