import * as path from "path";
import type {
  ClassifyContext,
  FlatScanEntry,
  SystemType,
} from "../types";
import { readTextSafe } from "../utils/file";
import { parseJsonLoose } from "../utils/text";
import { relativeFromDir } from "../utils/path";

export type SystemClassification = {
  type: SystemType;
  confidence: number;
  description: string;
};

function relUnderSystem(
  systemRoot: string,
  flat: FlatScanEntry[]
): FlatScanEntry[] {
  const norm = path.normalize(systemRoot);
  return flat.filter((e) => {
    const fp = path.normalize(e.fullPath);
    return fp === norm || fp.startsWith(norm + path.sep);
  });
}

function sysRel(systemRoot: string, e: FlatScanEntry): string {
  return relativeFromDir(systemRoot, e.fullPath);
}

function hasFile(
  systemRoot: string,
  under: FlatScanEntry[],
  predicate: (rel: string) => boolean
): boolean {
  return under.some((e) => {
    if (e.isDirectory) return false;
    return predicate(sysRel(systemRoot, e));
  });
}

function hasDirName(
  systemRoot: string,
  under: FlatScanEntry[],
  dirname: string
): boolean {
  return under.some(
    (e) =>
      e.isDirectory &&
      (e.name === dirname ||
        sysRel(systemRoot, e).split("/").includes(dirname))
  );
}

function hasDirMatching(
  systemRoot: string,
  under: FlatScanEntry[],
  re: RegExp
): boolean {
  return under.some(
    (e) => e.isDirectory && re.test(sysRel(systemRoot, e).split("/").pop() || "")
  );
}

/**
 * Folder basename hints backend / jobs — used to suppress weak web-app guesses.
 * Uses path segments so "typescript" does not match "script".
 */
export function folderNameSuggestsBackendService(folderName: string): boolean {
  const n = folderName.toLowerCase();
  const segments = n.split(/[-_/]/).filter(Boolean);
  const segHit = (s: string) => segments.includes(s);
  return (
    segHit("api") ||
    segHit("server") ||
    segHit("backend") ||
    segHit("worker") ||
    segHit("workers") ||
    segHit("jobs") ||
    segHit("queue") ||
    segHit("cli") ||
    segHit("ctl") ||
    segHit("script") ||
    segHit("migration") ||
    segHit("migrations")
  );
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

type ScoreMap = Record<SystemType, number>;

function emptyScores(): ScoreMap {
  return {
    "web-app": 0,
    "api-service": 0,
    "ui-library": 0,
    "docs-site": 0,
    "shared-package": 0,
    infra: 0,
    worker: 0,
    "support-system": 0,
    unknown: 0,
  };
}

function pickWinner(scores: ScoreMap): { type: SystemType; raw: number } {
  let best: SystemType = "unknown";
  let bestV = scores.unknown;
  (Object.keys(scores) as SystemType[]).forEach((t) => {
    if (scores[t] > bestV) {
      bestV = scores[t];
      best = t;
    }
  });
  return { type: best, raw: bestV };
}

function scoreToConfidence(raw: number, maxExpected = 1.2): number {
  if (raw <= 0) return 0.38;
  return clamp01(0.42 + (raw / maxExpected) * 0.48);
}

/**
 * Scored classifier: only strong in-system evidence may label web-app.
 * Monorepo root deps do not count — only this candidate's subtree + its package.json.
 */
export async function classifySystemType(
  systemRoot: string,
  repoRoot: string,
  flatIndex: FlatScanEntry[],
  ctx: ClassifyContext
): Promise<SystemClassification> {
  const under = relUnderSystem(systemRoot, flatIndex);
  const pkgPath = path.join(systemRoot, "package.json");
  const pkgRaw = await readTextSafe(pkgPath);
  const pkg = pkgRaw ? parseJsonLoose(pkgRaw) : null;

  const deps: Record<string, string> = pkg
    ? {
        ...((pkg.dependencies as Record<string, string>) || {}),
        ...((pkg.devDependencies as Record<string, string>) || {}),
        ...((pkg.peerDependencies as Record<string, string>) || {}),
      }
    : {};

  // Direct + dev deps only (not peerDeps) — used for strong "this IS the framework" signals.
  // peerDeps mean "host app must provide this", not "this package IS built on it".
  const directDeps: Record<string, string> = pkg
    ? {
        ...((pkg.dependencies as Record<string, string>) || {}),
        ...((pkg.devDependencies as Record<string, string>) || {}),
      }
    : {};

  // Runtime deps only (dependencies field, not devDeps or peerDeps).
  // An app built ON a framework lists it in dependencies at runtime.
  // A framework package building itself lists it in devDeps (for tests/build), not runtime deps.
  const runtimeDeps: Record<string, string> =
    (pkg?.dependencies as Record<string, string>) || {};

  const hasDep = (n: string) => Object.prototype.hasOwnProperty.call(deps, n);
  const hasDirectDep = (n: string) => Object.prototype.hasOwnProperty.call(directDeps, n);
  const hasRuntimeDep = (n: string) => Object.prototype.hasOwnProperty.call(runtimeDeps, n);

  const relFromRepo = path.relative(repoRoot, systemRoot);
  const posixRel =
    relFromRepo === "" ? "." : relFromRepo.split(path.sep).join("/");

  // Directories that are unconventional monorepo source roots (e.g., storybook uses `code/`,
  // some repos use `libs/`, `modules/`, `crates/`). Packages nested inside these dirs are
  // monorepo sub-packages, not standalone services.
  const UNCONVENTIONAL_MONO_TOPS = new Set(["code", "libs", "modules", "crates"]);
  const firstSegment = posixRel.split("/")[0];
  const isUnderUnconventionalMonorepoDir =
    UNCONVENTIONAL_MONO_TOPS.has(firstSegment) && posixRel.includes("/");

  const isUnderPackages =
    posixRel.startsWith("packages/") ||
    posixRel.split("/")[0] === "packages" ||
    posixRel.includes("/packages/") || // nested monorepos: code/packages/foo, apps/packages/foo
    isUnderUnconventionalMonorepoDir;  // storybook: code/lib/cli-sb, code/renderers/server

  const folderBackendHint = folderNameSuggestsBackendService(
    ctx.candidateFolderName
  );

  const hasNextConfigInSystem = under.some(
    (e) => !e.isDirectory && /^next\.config\.(mjs|js|cjs|ts)$/.test(e.name)
  );

  const nextAppRouter = hasFile(systemRoot, under, (r) =>
    /(^|\/)app\/(layout|page)\.(tsx|jsx|js|ts)$/.test(r.replace(/\\/g, "/"))
  );

  const nextPages = hasFile(systemRoot, under, (r) =>
    /(^|\/)pages\/(_app|index)\.(tsx|jsx|js|ts)$/.test(r.replace(/\\/g, "/"))
  );

  const hasViteConfig = hasFile(systemRoot, under, (r) =>
    /(^|\/)vite\.config\.(ts|js|mjs|cjs)$/.test(r)
  );

  const hasRootOrSrcIndexHtml = hasFile(
    systemRoot,
    under,
    (r) => /^(index\.html|src\/index\.html)$/.test(r)
  );

  const hasClientMainTsx = hasFile(systemRoot, under, (r) =>
    /^src\/main\.(tsx|jsx)$/.test(r)
  );

  /** SPA/web surface: Vite needs an HTML shell or clear client entry, not deps alone */
  const viteWebSurface =
    hasViteConfig &&
    (hasDep("react") || hasDep("vue") || hasDep("svelte") || hasDep("preact")) &&
    (hasRootOrSrcIndexHtml || hasClientMainTsx);

  /**
   * Minimum bar for web-app: Next physical signals or Vite+UI+entry, not `next` in package.json alone.
   */
  const qualifiesWebApp =
    hasNextConfigInSystem ||
    nextAppRouter ||
    nextPages ||
    viteWebSurface;

  const nest =
    under.some((e) => e.name === "nest-cli.json" && !e.isDirectory) ||
    hasRuntimeDep("@nestjs/core"); // runtime dep only — framework pkgs list it in devDeps/peerDeps, not dependencies

  const expressLike =
    hasDep("express") ||
    hasDep("fastify") ||
    hasDep("koa") ||
    hasDep("hono");

  const serverishEntry = hasFile(systemRoot, under, (r) => {
    const n = r.replace(/\\/g, "/").split("/").pop() || "";
    return /^(main|index|server|app)\.(ts|js|mts|cts)$/.test(n);
  });

  const versionedApi = hasDirMatching(systemRoot, under, /^v\d+$/i);

  const apiStructure =
    hasDirName(systemRoot, under, "routes") ||
    hasDirName(systemRoot, under, "controllers") ||
    hasDirName(systemRoot, under, "handlers") ||
    hasDirName(systemRoot, under, "middleware") ||
    hasFile(systemRoot, under, (r) => /(^|\/)routes?\//.test(r));

  const hasWebRouterDirs =
    hasDirName(systemRoot, under, "app") || hasDirName(systemRoot, under, "pages");

  const storybook =
    hasDep("@storybook/react") ||
    hasDep("storybook") ||
    hasDirName(systemRoot, under, ".storybook");

  // Packages under packages/ whose name suggests a build/dev-server tool rather
  // than a standalone running service (e.g. cli-sb, server-webpack, builder-vite).
  const nameParts = ctx.candidateFolderName.toLowerCase().split(/[-_]/);
  const isNamedBuildToolUnderPackages =
    isUnderPackages &&
    (nameParts.includes("cli") ||
      nameParts.includes("builder") ||
      nameParts.includes("preset") ||
      nameParts.includes("addon") ||
      // "server" under packages/ is a dev-server tool, not a standalone service
      // unless it also reads like an API (api-server, app-server)
      (nameParts.includes("server") &&
        !nameParts.some((p) => /^(api|app|web|gateway)$/.test(p))));

  const isBuildTool =
    storybook ||
    isNamedBuildToolUnderPackages ||
    hasDep("webpack-dev-server") ||
    hasDep("@storybook/builder-webpack5") ||
    hasDep("@storybook/builder-vite") ||
    (hasDep("webpack") && hasDep("express") && isUnderPackages) ||
    (hasDep("vite") && hasDep("express") && isUnderPackages);

  const docFramework =
    hasDep("@docusaurus/core") ||
    hasDep("nextra") ||
    hasFile(systemRoot, under, (r) => /(^|\/)docusaurus\.config\.(js|ts)$/.test(r));

  const docsFolder =
    hasDirName(systemRoot, under, "docs") &&
    hasFile(systemRoot, under, (r) => /\.(md|mdx)$/.test(r));

  const hasSrcTree = hasDirName(systemRoot, under, "src");
  const hasPythonManifest =
    hasFile(systemRoot, under, (r) => /^(pyproject\.toml|setup\.py|setup\.cfg)$/.test(r));

  // A docs folder alongside a dominant source tree or Python manifest
  // is normal project documentation, not a docs site
  const docsSite = docFramework || (docsFolder && !hasSrcTree && !hasPythonManifest);

  const infra =
    hasFile(systemRoot, under, (r) =>
      /(^|\/)(Dockerfile|docker-compose\.ya?ml)$/.test(r.replace(/\\/g, "/"))
    ) ||
    // Terraform files at any depth (.tf, .tfvars) — the repo itself IS the terraform project
    under.some((e) => !e.isDirectory && /\.tf(vars)?$/.test(e.name)) ||
    hasDirName(systemRoot, under, "terraform") ||
    hasDirName(systemRoot, under, "k8s") ||
    hasDirName(systemRoot, under, "kubernetes") ||
    hasDirName(systemRoot, under, "helm");

  const workerHints =
    /(^|\/)(worker|workers|jobs|queues)\//i.test(
      under.map((e) => sysRel(systemRoot, e)).join("|")
    ) ||
    hasDep("bullmq") ||
    hasDep("bull") ||
    hasDep("@temporalio/worker");

  const s = emptyScores();

  // --- Definitive / high-signal overrides ---
  if (nest) {
    return {
      type: "api-service",
      confidence: 0.92,
      description:
        "NestJS (`@nestjs/core` or `nest-cli.json`) inside this system — classified as an API/backend service.",
    };
  }

  // --- API scoring ---
  if (folderBackendHint) s["api-service"] += 0.38;
  if (versionedApi) s["api-service"] += 0.22;
  if (apiStructure) s["api-service"] += 0.28;
  if (expressLike && serverishEntry) s["api-service"] += 0.52;
  else if (expressLike) s["api-service"] += 0.2;
  if (serverishEntry && !nextAppRouter && !nextPages) s["api-service"] += 0.18;
  if (serverishEntry && apiStructure) s["api-service"] += 0.12;
  /** main.ts without Next pages/app suggests server, not browser app */
  if (
    hasFile(systemRoot, under, (r) => /^src\/main\.(ts|mts|cts)$/.test(r)) &&
    !nextAppRouter &&
    !nextPages
  ) {
    s["api-service"] += 0.25;
    s["web-app"] -= 0.15;
  }

  // --- Web scoring (strict) ---
  if (qualifiesWebApp) {
    if (hasNextConfigInSystem) s["web-app"] += 0.32;
    if (nextAppRouter) s["web-app"] += 0.55;
    if (nextPages) s["web-app"] += 0.48;
    if (viteWebSurface) s["web-app"] += 0.5;
    if (hasDep("next") && !hasNextConfigInSystem && !nextAppRouter && !nextPages) {
      s["web-app"] += 0.04;
    }
  } else if (hasDep("next") || hasDep("react")) {
    /** deps without in-system UI surface — do not become web-app */
    s["web-app"] += 0;
    if (hasDep("react") && isUnderPackages) s["ui-library"] += 0.25;
  }

  if (folderBackendHint) {
    /** Anti-false-positive: api-like folders need overwhelming web proof */
    const overwhelmingWeb =
      nextAppRouter ||
      nextPages ||
      (hasNextConfigInSystem && (nextAppRouter || nextPages || hasWebRouterDirs));
    if (!overwhelmingWeb) {
      s["web-app"] *= 0.12;
      s["web-app"] = Math.min(s["web-app"], 0.08);
    } else {
      s["web-app"] *= 0.85;
    }
    s["api-service"] += 0.08;
  }

  if (apiStructure && !nextAppRouter && !nextPages) {
    s["api-service"] += 0.15;
    s["web-app"] *= 0.7;
  }

  // --- Other types ---
  if (storybook) s["ui-library"] += 0.55;
  if (docsSite) s["docs-site"] += 0.62;
  if (infra) s.infra += 0.58;
  if (workerHints) s.worker += 0.5;

  if (isUnderPackages && pkg && !qualifiesWebApp && !nest && !expressLike) {
    s["shared-package"] += 0.35;
  }

  // Build tools under packages/ should never be api-service — they use express for
  // their dev server but are consumed as packages, not run as standalone services.
  if (isUnderPackages && isBuildTool && !nest) {
    s["shared-package"] += 0.55;
    s["api-service"] *= 0.25;
    s["worker"] *= 0.25;
  }

  // Python/polyglot packages: pyproject.toml or setup.py with src/ is a
  // library/package, not a docs site or unknown
  if (hasPythonManifest && hasSrcTree) {
    s["shared-package"] += 0.4;
    s["docs-site"] *= 0.2;
  } else if (hasPythonManifest) {
    s["shared-package"] += 0.25;
    s["docs-site"] *= 0.4;
  }

  // Packages with Storybook stories files are UI component packages, even without
  // a full Storybook dev dep (they export components consumed by a stories runner).
  // Guard: only boost small packages (≤15 JS/TS files). Large packages (framework
  // internals, renderers, addons) also contain stories as examples/tests but are NOT
  // UI libraries — their file count reveals the difference.
  const hasStoriesFiles = under.some(
    (e) => !e.isDirectory && /\.stories\.(jsx?|tsx?|mdx)$/.test(e.name)
  );
  const totalCodeFiles = under.filter(
    (e) => !e.isDirectory && /\.(tsx?|jsx?)$/.test(e.name)
  ).length;
  if (hasStoriesFiles && isUnderPackages && !nest && totalCodeFiles <= 15) {
    s["ui-library"] += 0.42;
    s["shared-package"] -= 0.1;
  }

  if (
    hasDep("react") ||
    hasDep("vue") ||
    hasDep("svelte")
  ) {
    if (!qualifiesWebApp && isUnderPackages) s["ui-library"] += 0.28;
    else if (!qualifiesWebApp && !folderBackendHint)
      s["ui-library"] += 0.12;
  }

  /** packages/* default to consumable unless there is unmistakable runnable structure here */
  if (isUnderPackages) {
    const unmistakableRunnable =
      nextAppRouter ||
      nextPages ||
      (hasNextConfigInSystem && (nextAppRouter || nextPages)) ||
      nest ||
      (expressLike && serverishEntry) ||
      docFramework;
    if (!unmistakableRunnable) {
      s["web-app"] *= 0.4;
      s["api-service"] *= 0.5;
      s["docs-site"] *= 0.45;
      s["worker"] *= 0.45;
      s["shared-package"] += 0.2;
    }
  }

  // --- Tie-break: API vs web when both positive ---
  if (s["web-app"] > 0 && s["api-service"] > 0) {
    if (s["api-service"] >= s["web-app"] - 0.02) {
      if (folderBackendHint || apiStructure || versionedApi) {
        s["web-app"] *= 0.35;
      }
    }
  }

  (Object.keys(s) as SystemType[]).forEach((t) => {
    s[t] = Math.max(0, s[t]);
  });

  let { type: winnerType, raw: winnerRaw } = pickWinner(s);

  /** Never emit web-app without in-system UI/router evidence */
  if (winnerType === "web-app" && !qualifiesWebApp) {
    s["web-app"] = 0;
    const again = pickWinner(s);
    winnerType = again.type;
    winnerRaw = again.raw;
  }

  if (winnerRaw <= 0.08) {
    return {
      type: "unknown",
      confidence: 0.4,
      description:
        "No strong in-system signature matched; Memor still lists entry points and blocks. (Root-level monorepo signals are not applied to this folder.)",
    };
  }

  const confidence = scoreToConfidence(winnerRaw);

  const descriptions: Record<SystemType, string> = {
    "web-app": qualifiesWebApp
      ? `Web app: Next.js/Vite-style UI evidence inside this folder (config, app/pages, or SPA entry), not package.json alone.`
      : `Web app (unexpected — low structural match; verify manually).`,
    "api-service": folderBackendHint
      ? `API/backend service: folder name and/or routes/controllers/versioned API layout suggest a server, not a browser app.`
      : `API/backend service: HTTP framework, Nest-style layout, or server entries in this system.`,
    "ui-library": `UI library or design-system style package (Storybook or UI-heavy dependency without a runnable app here).`,
    "docs-site": `Documentation site (Docusaurus/Nextra or docs content) in this system.`,
    "shared-package": `Shared package under packages/ without a dedicated app shell in this subtree.`,
    infra: `Infrastructure (Docker, Terraform, K8s/Helm) detected here.`,
    worker: `Worker or background-job style layout or dependencies.`,
    "support-system": `Architecturally significant directory without its own package.json.`,
    unknown: ``,
  };

  return {
    type: winnerType,
    confidence,
    description:
      descriptions[winnerType] ||
      "Heuristic classification from folder and file signals inside this system only.",
  };
}
