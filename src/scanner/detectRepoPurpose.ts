/**
 * detectRepoPurpose — deterministic repo purpose detection.
 *
 * Uses only structural signals: file type density, config files,
 * package.json scripts/dependencies, directory names.
 * Never guesses. Never uses LLM. Every conclusion traces to evidence.
 */
import fsPromises from "fs/promises";
import * as path from "path";

export type RepoPurposeKind =
  | "storybook-component-library" // Primary interface is Storybook; stories ARE the product
  | "e2e-testing-suite"            // Cypress/Playwright E2E test suite
  | "design-system"                // Component library + design tokens + Storybook
  | "ui-component-library"         // Component library without Storybook as primary surface
  | "api-backend"                  // Express/Fastify/NestJS service, minimal UI
  | "full-stack-app"               // Both UI and API in one repo
  | "developer-tooling"            // CLI, build tools, compilers, linters
  | "documentation-site"           // Docs-first: MDX, Docusaurus, Nextra, VuePress
  | "unknown";

export type RepoPurposeSignal = {
  /** Short human-readable description of the signal */
  label: string;
  /** What was found (file path, dependency name, script name) */
  evidence: string;
  /** 0–100, higher = stronger signal */
  weight: number;
};

export type InferredRepoPurpose = {
  kind: RepoPurposeKind;
  /** Human-readable label shown in UI */
  label: string;
  confidence: "high" | "medium" | "low";
  /** Every signal that contributed to this conclusion */
  signals: RepoPurposeSignal[];
};

// ── Helpers ───────────────────────────────────────────────────────────

async function fileExists(p: string): Promise<boolean> {
  try { await fsPromises.access(p); return true; } catch { return false; }
}

async function readJsonSafe(p: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fsPromises.readFile(p, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { return null; }
}

/**
 * Recursively count files matching a predicate, skipping heavy dirs.
 * Returns early once limit is reached for speed.
 */
const SKIP = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "coverage", "__pycache__", ".cache", "storybook-static",
]);

async function countFiles(
  dir: string,
  predicate: (name: string) => boolean,
  limit = 2000
): Promise<number> {
  let count = 0;
  async function walk(current: string): Promise<void> {
    if (count >= limit) return;
    let entries;
    try { entries = await fsPromises.readdir(current, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (count >= limit) return;
      if (e.isDirectory()) {
        if (!SKIP.has(e.name) && !e.name.startsWith(".")) await walk(path.join(current, e.name));
      } else if (predicate(e.name)) {
        count++;
      }
    }
  }
  await walk(dir);
  return count;
}

async function totalSourceFiles(dir: string): Promise<number> {
  return countFiles(dir, (n) => /\.(jsx?|tsx?|mjs|cjs)$/.test(n));
}

// ── Main detector ─────────────────────────────────────────────────────

export async function detectRepoPurpose(
  rootPath: string
): Promise<InferredRepoPurpose> {
  const signals: RepoPurposeSignal[] = [];
  const scores: Partial<Record<RepoPurposeKind, number>> = {};

  function add(kind: RepoPurposeKind, signal: RepoPurposeSignal) {
    signals.push(signal);
    scores[kind] = (scores[kind] ?? 0) + signal.weight;
  }

  // ── 1. package.json scripts and dependencies ──────────────────────
  const pkgPath = path.join(rootPath, "package.json");
  const pkg = await readJsonSafe(pkgPath);
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
  const deps = {
    ...(pkg?.dependencies ?? {}) as Record<string, string>,
    ...(pkg?.devDependencies ?? {}) as Record<string, string>,
  };
  const depNames = Object.keys(deps);
  const scriptNames = Object.keys(scripts);

  // Storybook scripts
  if (scriptNames.some((s) => /storybook/.test(s))) {
    add("storybook-component-library", {
      label: "storybook script in package.json",
      evidence: `scripts.${scriptNames.find((s) => /storybook/.test(s))!}`,
      weight: 30,
    });
  }

  // Storybook devDeps
  const sbDeps = depNames.filter((d) => d.includes("@storybook/") || d === "storybook");
  if (sbDeps.length >= 2) {
    add("storybook-component-library", {
      label: `${sbDeps.length} Storybook packages in dependencies`,
      evidence: sbDeps.slice(0, 3).join(", "),
      weight: 30,
    });
  } else if (sbDeps.length === 1) {
    add("storybook-component-library", {
      label: "Storybook dependency",
      evidence: sbDeps[0],
      weight: 15,
    });
  }

  // Cypress deps/scripts
  const cyDeps = depNames.filter((d) => /cypress/.test(d));
  const cyScripts = scriptNames.filter((s) => /cypress|e2e/.test(s));
  if (cyDeps.length > 0 || cyScripts.length > 0) {
    const ev = [...cyDeps, ...cyScripts][0];
    add("e2e-testing-suite", {
      label: "Cypress in dependencies or scripts",
      evidence: ev,
      weight: 40,
    });
  }

  // Playwright
  const pwDeps = depNames.filter((d) => /playwright/.test(d));
  if (pwDeps.length > 0) {
    add("e2e-testing-suite", {
      label: "Playwright in dependencies",
      evidence: pwDeps[0],
      weight: 40,
    });
  }

  // Design token / design-system signals
  const dsDeps = depNames.filter((d) =>
    /style-dictionary|theo|@tokens-studio|design-tokens|figma-tokens/.test(d)
  );
  if (dsDeps.length > 0) {
    add("design-system", {
      label: "Design token tooling detected",
      evidence: dsDeps[0],
      weight: 25,
    });
  }

  // API-backend signals from scripts
  if (scriptNames.some((s) => /^start(:server)?$/.test(s)) &&
    depNames.some((d) => /express|fastify|koa|nestjs|hono/.test(d))) {
    add("api-backend", {
      label: "Server framework + start script",
      evidence: depNames.find((d) => /express|fastify|koa|nestjs|hono/.test(d)) ?? "server",
      weight: 35,
    });
  }

  // Docs signals
  if (depNames.some((d) => /docusaurus|nextra|vuepress|docus|starlight/.test(d))) {
    const ev = depNames.find((d) => /docusaurus|nextra|vuepress|docus|starlight/.test(d))!;
    add("documentation-site", { label: "Documentation framework", evidence: ev, weight: 45 });
  }

  // Tooling signals
  const isCLI = depNames.some((d) => /commander|yargs|meow|cleye/.test(d)) ||
    scriptNames.some((s) => /^(bin|cli)$/.test(s));
  if (isCLI) {
    const ev = depNames.find((d) => /commander|yargs|meow|cleye/.test(d)) ?? "bin script";
    add("developer-tooling", { label: "CLI tooling detected", evidence: ev, weight: 30 });
  }

  // ── 2. Config file presence ────────────────────────────────────────

  // Storybook config dir
  if (await fileExists(path.join(rootPath, ".storybook"))) {
    add("storybook-component-library", {
      label: ".storybook/ config directory",
      evidence: ".storybook/",
      weight: 35,
    });
    // Also consider design-system if storybook exists alongside UI deps
    if (sbDeps.length > 0) {
      add("design-system", {
        label: ".storybook/ with Storybook deps",
        evidence: ".storybook/",
        weight: 10,
      });
    }
  }

  // Cypress config
  const cyConfigs = ["cypress.config.ts", "cypress.config.js", "cypress.config.mjs", "cypress.json"];
  for (const cf of cyConfigs) {
    if (await fileExists(path.join(rootPath, cf))) {
      add("e2e-testing-suite", {
        label: "Cypress config file",
        evidence: cf,
        weight: 40,
      });
      break;
    }
  }

  // Playwright config
  const pwConfigs = ["playwright.config.ts", "playwright.config.js"];
  for (const cf of pwConfigs) {
    if (await fileExists(path.join(rootPath, cf))) {
      add("e2e-testing-suite", {
        label: "Playwright config file",
        evidence: cf,
        weight: 40,
      });
      break;
    }
  }

  // ── 3. File density signals ────────────────────────────────────────

  const [storyCount, totalCount] = await Promise.all([
    countFiles(rootPath, (n) => /\.stories\.(jsx?|tsx?|mdx)$/.test(n)),
    totalSourceFiles(rootPath),
  ]);

  if (storyCount > 0 && totalCount > 0) {
    const storyRatio = storyCount / totalCount;
    if (storyCount >= 20) {
      const weight = storyCount >= 100 ? 50 : storyCount >= 20 ? 35 : 20;
      add("storybook-component-library", {
        label: `${storyCount} .stories files (${Math.round(storyRatio * 100)}% of source)`,
        evidence: `${storyCount} .stories.* files`,
        weight,
      });
    }
    // High story ratio also hints at design-system
    if (storyRatio > 0.3 && storyCount >= 30) {
      add("design-system", {
        label: "High story density suggests design system",
        evidence: `${storyCount} stories / ${totalCount} source files`,
        weight: 15,
      });
    }
  }

  // Cypress spec files — only .cy.* extensions are unambiguously Cypress.
  // .spec.ts/.spec.js are Vitest/Jest unit tests in most codebases — do NOT count them.
  const specCount = await countFiles(
    rootPath,
    (n) => /\.cy\.(jsx?|tsx?)$/.test(n),
    500
  );
  if (specCount >= 5) {
    add("e2e-testing-suite", {
      label: `${specCount} .cy.* Cypress test files`,
      evidence: `${specCount} .cy.* files`,
      weight: specCount >= 30 ? 40 : 25,
    });
  }

  // ── 4. Directory pattern signals ───────────────────────────────────

  const dirsToCheck = [
    { dir: "cypress", kind: "e2e-testing-suite" as RepoPurposeKind, label: "cypress/ directory", weight: 35 },
    { dir: "e2e", kind: "e2e-testing-suite" as RepoPurposeKind, label: "e2e/ directory", weight: 25 },
    { dir: "playwright", kind: "e2e-testing-suite" as RepoPurposeKind, label: "playwright/ directory", weight: 30 },
    { dir: "tokens", kind: "design-system" as RepoPurposeKind, label: "tokens/ design token directory", weight: 20 },
    { dir: "primitives", kind: "design-system" as RepoPurposeKind, label: "primitives/ directory (design system pattern)", weight: 15 },
  ];
  await Promise.all(dirsToCheck.map(async ({ dir, kind, label, weight }) => {
    if (await fileExists(path.join(rootPath, dir))) {
      add(kind, { label, evidence: `${dir}/`, weight });
    }
  }));

  // ── 5. Determine winner ────────────────────────────────────────────

  const ranked = (Object.entries(scores) as [RepoPurposeKind, number][])
    .sort((a, b) => b[1] - a[1]);

  const topKind = ranked[0]?.[0] ?? "unknown";
  const topScore = ranked[0]?.[1] ?? 0;
  const secondScore = ranked[1]?.[1] ?? 0;

  // Resolve storybook vs design-system: if both are high, check design-system-specific signals
  let kind: RepoPurposeKind = topKind;
  if (topKind === "storybook-component-library" || topKind === "design-system") {
    const dsScore = scores["design-system"] ?? 0;
    const sbScore = scores["storybook-component-library"] ?? 0;
    const hasDesignSystemSignals = signals.some((s) =>
      /token|figma|primitives|design system/.test(s.label.toLowerCase())
    );
    kind = (dsScore >= 35 && hasDesignSystemSignals) ? "design-system" : "storybook-component-library";
  }

  // Confidence
  const margin = topScore - secondScore;
  const confidence: "high" | "medium" | "low" =
    topScore >= 70 && margin >= 30 ? "high" :
    topScore >= 40 ? "medium" :
    topScore > 0 ? "low" : "low";

  // Label
  const LABELS: Record<RepoPurposeKind, string> = {
    "storybook-component-library": "Component library powered by Storybook",
    "e2e-testing-suite":           "End-to-end test suite",
    "design-system":               "Design system with component library",
    "ui-component-library":        "UI component library",
    "api-backend":                 "API backend service",
    "full-stack-app":              "Full-stack application",
    "developer-tooling":           "Developer tooling / CLI",
    "documentation-site":          "Documentation site",
    "unknown":                     "General-purpose codebase",
  };

  return {
    kind: topScore === 0 ? "unknown" : kind,
    label: LABELS[kind],
    confidence,
    signals: signals.sort((a, b) => b.weight - a.weight),
  };
}
