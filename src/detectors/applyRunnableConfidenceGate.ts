import * as path from "path";
import type {
  ClassifyContext,
  EntryPoint,
  FlatScanEntry,
  SystemType,
} from "../types";
import type { SystemClassification } from "./classifySystemType";
import { relativeFromDir } from "../utils/path";

const RUNNABLE_TYPES: SystemType[] = [
  "web-app",
  "api-service",
  "docs-site",
  "worker",
];

const CONF_THRESHOLD = 0.56;

function relUnder(systemRoot: string, flat: FlatScanEntry[]): FlatScanEntry[] {
  const norm = path.normalize(systemRoot);
  return flat.filter((e) => {
    const fp = path.normalize(e.fullPath);
    return fp === norm || fp.startsWith(norm + path.sep);
  });
}

function hasFile(
  systemRoot: string,
  under: FlatScanEntry[],
  pred: (rel: string) => boolean
): boolean {
  return under.some((e) => {
    if (e.isDirectory) return false;
    return pred(relativeFromDir(systemRoot, e.fullPath));
  });
}

function hasDir(under: FlatScanEntry[], systemRoot: string, name: string): boolean {
  return under.some(
    (e) =>
      e.isDirectory &&
      (e.name === name ||
        relativeFromDir(systemRoot, e.fullPath).split("/").includes(name))
  );
}

function isPackageJsonOnly(entryPoints: EntryPoint[]): boolean {
  // Empty means "entry point not detected", not "only package.json" — do NOT treat as pkgOnly.
  // pkgOnly is meant for packages whose only detected entry is the package.json itself.
  if (entryPoints.length === 0) return false;
  return entryPoints.every(
    (ep) =>
      ep.path.endsWith("package.json") || ep.path.endsWith("/package.json")
  );
}

function hasNonMetadataEntry(entryPoints: EntryPoint[]): boolean {
  return entryPoints.some(
    (ep) =>
      !ep.path.endsWith("package.json") &&
      !ep.path.endsWith("/package.json")
  );
}

function strongWebStructure(systemRoot: string, under: FlatScanEntry[]): boolean {
  return (
    hasFile(systemRoot, under, (r) =>
      /(^|\/)app\/(layout|page)\.(tsx|jsx|js|ts)$/.test(r)
    ) ||
    hasFile(systemRoot, under, (r) =>
      /(^|\/)pages\/(_app|index)\.(tsx|jsx|js|ts)$/.test(r)
    ) ||
    under.some(
      (e) => !e.isDirectory && /^next\.config\.(mjs|js|cjs|ts)$/.test(e.name)
    ) ||
    (hasFile(systemRoot, under, (r) =>
      /(^|\/)vite\.config\.(ts|js|mjs|cjs)$/.test(r)) &&
      (hasFile(systemRoot, under, (r) =>
        /^(index\.html|src\/index\.html)$/.test(r)) ||
        hasFile(systemRoot, under, (r) => /^src\/main\.(tsx|jsx)$/.test(r))))
  );
}

function strongApiStructure(systemRoot: string, under: FlatScanEntry[]): boolean {
  return (
    under.some((e) => e.name === "nest-cli.json" && !e.isDirectory) ||
    hasFile(systemRoot, under, (r) => /^src\/main\.(ts|js|mts|cts)$/.test(r)) ||
    hasFile(systemRoot, under, (r) => /^src\/server\.(ts|js)$/.test(r)) ||
    hasFile(systemRoot, under, (r) => /^server\.(ts|js)$/.test(r)) ||
    hasFile(systemRoot, under, (r) => /^(src\/)?index\.(ts|js|mts|cts)$/.test(r)) ||
    hasDir(under, systemRoot, "routes") ||
    hasDir(under, systemRoot, "controllers") ||
    hasDir(under, systemRoot, "handlers") ||
    hasFile(systemRoot, under, (r) => /(^|\/)v\d+\//.test(r))
  );
}

function strongDocsStructure(systemRoot: string, under: FlatScanEntry[]): boolean {
  return (
    hasFile(systemRoot, under, (r) => /docusaurus\.config\.(js|ts)$/.test(r)) ||
    (hasDir(under, systemRoot, "docs") &&
      hasFile(systemRoot, under, (r) => /\.(md|mdx)$/.test(r)))
  );
}

function strongWorkerStructure(systemRoot: string, under: FlatScanEntry[]): boolean {
  const hinted = under.some((e) => {
    const r = relativeFromDir(systemRoot, e.fullPath);
    return /worker|workers|jobs|queue|bull|temporal|consumer|processor/i.test(r);
  });
  if (!hinted) return false;
  return hasFile(systemRoot, under, (r) => /\.(ts|js|mts|cts)$/.test(r));
}

function underPackages(ctx: ClassifyContext): boolean {
  const rr = ctx.relativeRoot === "." ? "" : ctx.relativeRoot;
  const p = rr.split("/").filter(Boolean);
  return p[0] === "packages";
}

/**
 * Downgrades aggressive runnable labels when entry and structure evidence are thin.
 * Prefer underclaiming over false certainty.
 */
export function applyRunnableConfidenceGate(
  classification: SystemClassification,
  systemRoot: string,
  flatIndex: FlatScanEntry[],
  ctx: ClassifyContext,
  entryPoints: EntryPoint[]
): SystemClassification {
  const t = classification.type;
  if (!RUNNABLE_TYPES.includes(t)) return classification;

  const under = relUnder(systemRoot, flatIndex);
  const pkgOnly = isPackageJsonOnly(entryPoints);
  const hasFileEntry = hasNonMetadataEntry(entryPoints);
  const underPkgs = underPackages(ctx);
  const lowConf = classification.confidence < CONF_THRESHOLD;

  let structuralOk = false;
  if (t === "web-app") structuralOk = strongWebStructure(systemRoot, under);
  else if (t === "api-service") structuralOk = strongApiStructure(systemRoot, under);
  else if (t === "docs-site") structuralOk = strongDocsStructure(systemRoot, under);
  else if (t === "worker") structuralOk = strongWorkerStructure(systemRoot, under);

  const weak =
    pkgOnly ||
    (!hasFileEntry && !structuralOk) ||
    (lowConf && !structuralOk) ||
    (underPkgs && !structuralOk && (t === "web-app" || t === "api-service"));

  if (!weak) return classification;

  const downType: SystemType =
    underPkgs || hasFile(systemRoot, under, (r) => /\.(ts|tsx|js|jsx)$/.test(r))
      ? "shared-package"
      : "unknown";

  return {
    type: downType,
    confidence: Math.min(classification.confidence, 0.48),
    description: `Memor underclaimed this folder as “${downType}”: runnable-type signals were weak (e.g. missing non–package.json entry or in-system structure). Original hint: ${t}. ${classification.description}`,
  };
}
