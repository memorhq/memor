import * as path from "path";
import type { AppArchetype, FlatScanEntry, MemorSystem } from "../types";

type Ctx = { candidateName: string; relativeRoot: string };

function norm(p: string): string {
  return path.normalize(p);
}

function textBlob(system: MemorSystem, ctx: Ctx): string {
  return [
    system.name,
    ctx.candidateName,
    ctx.relativeRoot,
    system.rootPath,
    ...system.blocks.map((b) => `${b.name} ${b.path} ${b.type}`),
    ...system.entryPoints.map((e) => e.path),
    ...system.tags,
  ]
    .join(" ")
    .toLowerCase();
}

function hasMarkdownUnder(
  systemRootAbs: string,
  flat: FlatScanEntry[]
): boolean {
  const root = norm(systemRootAbs);
  return flat.some((e) => {
    if (e.isDirectory) return false;
    if (!/\.(md|mdx)$/i.test(e.name)) return false;
    const fp = norm(e.fullPath);
    return fp === root || fp.startsWith(root + path.sep);
  });
}

const SPECIAL_ORDER: AppArchetype[] = [
  "docs-app",
  "admin-app",
  "component-showcase",
  "learning-app",
  "marketing-site",
];

/**
 * Secondary label for runnable **web-app** systems only.
 * Omits the field when evidence is weak (treated as unknown).
 */
export function detectAppArchetype(
  system: MemorSystem,
  ctx: Ctx,
  flat: FlatScanEntry[],
  systemRootAbs: string
): AppArchetype | undefined {
  if (system.type !== "web-app" || system.runtimeRole !== "runnable") {
    return undefined;
  }

  const blob = textBlob(system, ctx);
  const rr = ctx.relativeRoot.toLowerCase();

  const scores: Record<AppArchetype, number> = {
    "product-app": 0,
    "marketing-site": 0,
    "docs-app": 0,
    "admin-app": 0,
    "component-showcase": 0,
    "learning-app": 0,
    unknown: 0,
  };

  const nameAndPath =
    `${system.name} ${ctx.candidateName} ${ctx.relativeRoot}`.toLowerCase();
  const hasStrongProductBlocks = system.blocks.some((b) =>
    ["features", "api-layer", "state", "server-code", "database"].includes(
      b.type
    )
  );

  const nameIsDocs =
    /\b(docs|documentation|reference|guidebook|handbook|docusaurus|nextra)\b/.test(
      nameAndPath
    );

  if (nameIsDocs) {
    scores["docs-app"] += 0.74;
  } else if (
    system.blocks.some((b) => b.type === "docs") &&
    hasMarkdownUnder(systemRootAbs, flat) &&
    !hasStrongProductBlocks
  ) {
    scores["docs-app"] += 0.44;
  }
  if (
    /\/guides?\//.test(blob) ||
    /\b(api-reference|reference-docs)\b/.test(blob)
  ) {
    scores["docs-app"] += 0.18;
  }
  if (hasStrongProductBlocks && !nameIsDocs) {
    scores["docs-app"] -= 0.3;
  }

  if (
    /\b(studio|admin|console|portal|backoffice|internal-tools)\b/.test(blob)
  ) {
    scores["admin-app"] += 0.7;
  }
  if (
    /\b(dashboard|workspace)\b/.test(blob) &&
    /\b(users|billing|organization|projects|teams)\b/.test(blob)
  ) {
    scores["admin-app"] += 0.18;
  }

  if (
    /\b(design-system|storybook|showcase|patterns|playground|ui-kit|uikit|component-library)\b/.test(
      blob
    ) ||
    system.tags.some((t) => /storybook/i.test(t))
  ) {
    scores["component-showcase"] += 0.76;
  }
  if (
    /\b(components?|examples?)\b/.test(blob) &&
    system.blocks.filter((b) => b.type === "ui-components").length >= 1
  ) {
    scores["component-showcase"] += 0.32;
  }

  if (
    /\b(learn|learning|tutorial|academy|course|lessons|training|education)\b/.test(
      blob
    )
  ) {
    scores["learning-app"] += 0.74;
  }

  if (
    /\b(www|website|landing|homepage|marketing-site)\b/.test(blob) ||
    /^apps\/(www|site|marketing)(\/|$)/.test(rr)
  ) {
    scores["marketing-site"] += 0.64;
  }
  if (
    system.blocks.some((b) => b.type === "routes") &&
    !system.blocks.some((b) =>
      ["database", "api-layer", "features"].includes(b.type)
    ) &&
    /pricing|contact|about|customers|alternatives/.test(blob)
  ) {
    scores["marketing-site"] += 0.26;
  }

  if (
    system.blocks.some((b) =>
      ["features", "api-layer", "database", "state"].includes(b.type)
    )
  ) {
    scores["product-app"] += 0.38;
  }
  if (/[/\\]app[/\\]\(|[/\\]pages[/\\]|src[/\\]features/.test(blob)) {
    scores["product-app"] += 0.24;
  }

  const maxSpecial = Math.max(
    ...SPECIAL_ORDER.map((k) => scores[k]),
    0
  );
  const productScore = scores["product-app"];

  let best: AppArchetype = "product-app";
  let bestV = productScore;
  for (const k of SPECIAL_ORDER) {
    if (scores[k] > bestV) {
      bestV = scores[k];
      best = k;
    }
  }
  /** Prefer a clear specialized label over generic product when both are plausible */
  if (best === "product-app" && maxSpecial >= 0.46) {
    best = SPECIAL_ORDER.reduce((a, k) =>
      scores[k] > scores[a] ? k : a
    );
    bestV = scores[best];
  }

  const THRESHOLD = 0.5;
  if (bestV < THRESHOLD) return undefined;
  return best;
}
