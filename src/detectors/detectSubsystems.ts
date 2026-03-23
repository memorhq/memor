import * as fs from "fs";
import * as path from "path";
import type {
  AppArchetype,
  FlatScanEntry,
  MemorSystem,
  SystemSubsystem,
} from "../types";
import { slugify } from "../utils/text";
import { toPosix } from "../utils/path";

const MAX = 5;

function existsSyncSafe(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function directChildrenDirs(
  parentAbs: string,
  flat: FlatScanEntry[]
): FlatScanEntry[] {
  const norm = path.normalize(parentAbs);
  return flat.filter((e) => {
    if (!e.isDirectory) return false;
    return path.normalize(path.dirname(e.fullPath)) === norm;
  });
}

function relDisplay(systemRootRelative: string, segments: string[]): string {
  const joined = path.join(...segments);
  return systemRootRelative === "."
    ? toPosix(joined)
    : toPosix(path.join(systemRootRelative, joined));
}

function pickStartFile(absDir: string, baseRel: string): string {
  const files = [
    "index.ts",
    "index.js",
    "index.mjs",
    "router.ts",
    "routes.ts",
    "route.ts",
    "main.ts",
  ];
  for (const f of files) {
    const ap = path.join(absDir, f);
    if (existsSyncSafe(ap)) return `${baseRel}/${f}`.replace(/\/+/g, "/");
  }
  return baseRel;
}

function isVersionName(name: string): boolean {
  return /^v\d+$/i.test(name);
}

function collectApiVersions(
  systemRootAbs: string,
  systemRootRelative: string,
  flat: FlatScanEntry[],
  systemId: string
): SystemSubsystem[] {
  const out: SystemSubsystem[] = [];
  let idx = 0;

  const tryAdd = (absDir: string, parts: string[]) => {
    const name = parts[parts.length - 1];
    if (!isVersionName(name)) return;
    const baseRel = relDisplay(systemRootRelative, parts);
    const start = pickStartFile(absDir, baseRel);
    out.push({
      id: `${systemId}-sub-${slugify(name)}-${idx++}`,
      name,
      path: baseRel,
      kind: "api-version",
      description: `API version surface for ${name} routes and handlers (heuristic).`,
      confidence: 0.74,
      recommendedStartPath: start,
    });
  };

  for (const d of directChildrenDirs(systemRootAbs, flat)) {
    if (isVersionName(d.name)) tryAdd(d.fullPath, [d.name]);
  }

  for (const seg of ["src", "api", "lib", "server"]) {
    const mid = path.join(systemRootAbs, seg);
    if (!existsSyncSafe(mid)) continue;
    for (const d of directChildrenDirs(mid, flat)) {
      if (isVersionName(d.name)) tryAdd(d.fullPath, [seg, d.name]);
    }
  }

  const seen = new Set<string>();
  return out.filter((s) => {
    if (seen.has(s.path)) return false;
    seen.add(s.path);
    return true;
  });
}

const MARKETING_LEAF = new Set([
  "contact",
  "customers",
  "alternatives",
  "pricing",
  "about",
  "legal",
  "privacy",
  "terms",
  "careers",
  "blog",
]);

const ARCH_HIGH = new Set([
  "dashboard",
  "settings",
  "account",
  "billing",
  "profile",
  "admin",
  "auth",
  "login",
  "onboarding",
  "analytics",
  "studio",
  "projects",
  "organization",
  "workspace",
  "users",
  "teams",
]);

function isRouteGroup(name: string): boolean {
  return /^\([^)]+\)$/.test(name);
}

function segmentKey(name: string): string {
  return isRouteGroup(name)
    ? name.slice(1, -1).toLowerCase()
    : name.toLowerCase();
}

/**
 * Higher score = more useful to surface first. Marketing leaves stay low
 * unless the app looks like a marketing site or nothing better exists.
 */
function scoreWebSegment(
  name: string,
  appHint: AppArchetype | undefined
): number {
  const key = segmentKey(name);
  const group = isRouteGroup(name);
  let s = group ? 64 : 46;

  if (ARCH_HIGH.has(key)) s = 92;
  if (MARKETING_LEAF.has(key)) s = Math.min(s, 30);
  if (/^(e2e|test|tests|__tests__|__mocks__|mocks?|fixtures?|cache|utils?|helpers?|scripts?)$/.test(key)) {
    s = Math.min(s, 22);
  }

  if (appHint === "marketing-site" && MARKETING_LEAF.has(key)) {
    s = Math.max(s, 56);
  }
  if (
    appHint === "docs-app" &&
    /^(guides?|reference|api|faq|docs|getting-started)$/.test(key)
  ) {
    s = Math.max(s, 90);
  }
  if (appHint === "admin-app" && ARCH_HIGH.has(key)) {
    s = Math.max(s, 94);
  }
  if (
    appHint === "component-showcase" &&
    /^(components?|patterns?|examples?|stories|storybook|ui)$/.test(key)
  ) {
    s = Math.max(s, 90);
  }
  if (
    appHint === "learning-app" &&
    /^(lessons?|tutorials?|courses?|learn|academy)$/.test(key)
  ) {
    s = Math.max(s, 90);
  }
  if (!appHint || appHint === "product-app" || appHint === "unknown") {
    if (/^(guides?|reference|api|faq)$/.test(key)) s = Math.max(s, 74);
  }

  return s;
}

function confidenceFromScore(score: number, group: boolean): number {
  const t = 0.55 + score / 400;
  const cap = group ? 0.7 : 0.72;
  return Math.min(cap, Math.max(0.56, t));
}

type WebCand = {
  name: string;
  parts: string[];
  absDir: string;
  kind: "module" | "feature-area";
  score: number;
};

function collectWebFeatureAreas(
  systemRootAbs: string,
  systemRootRelative: string,
  flat: FlatScanEntry[],
  systemId: string,
  appHint: AppArchetype | undefined
): SystemSubsystem[] {
  const cands: WebCand[] = [];

  const appDir = path.join(systemRootAbs, "app");
  if (existsSyncSafe(appDir)) {
    for (const d of directChildrenDirs(appDir, flat)) {
      if (d.name.startsWith("_")) continue;
      const sc = scoreWebSegment(d.name, appHint);
      cands.push({
        name: d.name,
        parts: ["app", d.name],
        absDir: d.fullPath,
        kind: isRouteGroup(d.name) ? "module" : "feature-area",
        score: sc,
      });
    }
  }

  const featRoot = path.join(systemRootAbs, "src", "features");
  if (existsSyncSafe(featRoot)) {
    for (const d of directChildrenDirs(featRoot, flat)) {
      const sc = scoreWebSegment(d.name, appHint) + 6;
      cands.push({
        name: d.name,
        parts: ["src", "features", d.name],
        absDir: d.fullPath,
        kind: "feature-area",
        score: sc,
      });
    }
  }

  const modRoot = path.join(systemRootAbs, "src", "modules");
  if (existsSyncSafe(modRoot)) {
    for (const d of directChildrenDirs(modRoot, flat)) {
      const sc = scoreWebSegment(d.name, appHint) + 6;
      cands.push({
        name: d.name,
        parts: ["src", "modules", d.name],
        absDir: d.fullPath,
        kind: "feature-area",
        score: sc,
      });
    }
  }

  const pagesDir = path.join(systemRootAbs, "pages");
  if (existsSyncSafe(pagesDir)) {
    for (const d of directChildrenDirs(pagesDir, flat)) {
      if (d.name.startsWith("_") || d.name === "api") continue;
      const sc = scoreWebSegment(d.name, appHint) - 4;
      cands.push({
        name: d.name,
        parts: ["pages", d.name],
        absDir: d.fullPath,
        kind: "feature-area",
        score: sc,
      });
    }
  }

  const byPath = new Map<string, WebCand>();
  for (const c of cands) {
    const rel = relDisplay(systemRootRelative, c.parts);
    const prev = byPath.get(rel);
    if (!prev || c.score > prev.score) byPath.set(rel, c);
  }

  const sorted = [...byPath.values()].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, MAX);

  let idx = 0;
  return top.map((c) => {
    const baseRel = relDisplay(systemRootRelative, c.parts);
    const group = c.kind === "module";
    return {
      id: `${systemId}-sub-${slugify(c.name)}-${idx++}`,
      name: c.name,
      path: baseRel,
      kind: c.kind,
      description: group
        ? `Route group \`${c.name}\` under the App Router (heuristic).`
        : c.parts[0] === "pages"
          ? `Pages Router segment \`${c.name}/\`.`
          : c.parts[1] === "features"
            ? `Feature slice \`${c.name}\` under \`src/features/\`.`
            : c.parts[1] === "modules"
              ? `Module area \`${c.name}\` under \`src/modules/\`.`
              : `Likely area \`${c.name}\` under \`${c.parts[0]}/\`.`,
      confidence: confidenceFromScore(c.score, group),
      recommendedStartPath: pickStartFile(c.absDir, baseRel),
    };
  });
}

const DOC_SECTIONS = new Set(["api", "guides", "guide", "faq", "reference", "getting-started"]);

function collectDocsSections(
  systemRootAbs: string,
  systemRootRelative: string,
  flat: FlatScanEntry[],
  systemId: string
): SystemSubsystem[] {
  const docsDir = path.join(systemRootAbs, "docs");
  if (!existsSyncSafe(docsDir)) return [];

  const out: SystemSubsystem[] = [];
  let idx = 0;

  for (const d of directChildrenDirs(docsDir, flat)) {
    if (!DOC_SECTIONS.has(d.name.toLowerCase())) continue;
    const parts = ["docs", d.name];
    const baseRel = relDisplay(systemRootRelative, parts);
    out.push({
      id: `${systemId}-sub-doc-${slugify(d.name)}-${idx++}`,
      name: d.name,
      path: baseRel,
      kind: "docs-section",
      description: `Documentation section \`${d.name}/\`.`,
      confidence: 0.66,
      recommendedStartPath: baseRel + "/",
    });
  }

  return out;
}

const WORKER_ROOTS = ["jobs", "queues", "processors", "consumers", "workers"];

function collectWorkerSurfaces(
  systemRootAbs: string,
  systemRootRelative: string,
  flat: FlatScanEntry[],
  systemId: string
): SystemSubsystem[] {
  const out: SystemSubsystem[] = [];
  let idx = 0;

  const considerRoot = (rootAbs: string, prefix: string[]) => {
    if (!existsSyncSafe(rootAbs)) return;
    for (const d of directChildrenDirs(rootAbs, flat).slice(0, 4)) {
      const parts = [...prefix, d.name];
      const baseRel = relDisplay(systemRootRelative, parts);
      out.push({
        id: `${systemId}-sub-job-${slugify(d.name)}-${idx++}`,
        name: d.name,
        path: baseRel,
        kind: "worker-surface",
        description: `Worker or job-related area \`${parts.join("/")}/\` (heuristic).`,
        confidence: 0.6,
        recommendedStartPath: pickStartFile(d.fullPath, baseRel),
      });
    }
  };

  for (const w of WORKER_ROOTS) {
    considerRoot(path.join(systemRootAbs, w), [w]);
  }
  for (const w of WORKER_ROOTS) {
    considerRoot(path.join(systemRootAbs, "src", w), ["src", w]);
  }

  return out;
}

/**
 * Second-layer surfaces inside **primary** systems only; capped and conservative.
 */
export function detectSubsystems(
  system: MemorSystem,
  systemRootAbs: string,
  systemRootRelative: string,
  flat: FlatScanEntry[]
): SystemSubsystem[] | undefined {
  if (system.systemTier !== "primary") return undefined;

  const merged: SystemSubsystem[] = [];

  if (system.type === "api-service") {
    merged.push(
      ...collectApiVersions(
        systemRootAbs,
        systemRootRelative,
        flat,
        system.id
      )
    );
  }

  if (system.type === "web-app") {
    merged.push(
      ...collectWebFeatureAreas(
        systemRootAbs,
        systemRootRelative,
        flat,
        system.id,
        system.appArchetype
      )
    );
  }

  if (system.type === "docs-site") {
    merged.push(
      ...collectDocsSections(
        systemRootAbs,
        systemRootRelative,
        flat,
        system.id
      )
    );
  }

  if (system.type === "worker") {
    merged.push(
      ...collectWorkerSurfaces(
        systemRootAbs,
        systemRootRelative,
        flat,
        system.id
      )
    );
  }

  const byPath = new Map<string, SystemSubsystem>();
  for (const m of merged) {
    if (!byPath.has(m.path)) byPath.set(m.path, m);
  }

  const uniq = [...byPath.values()].slice(0, MAX);
  return uniq.length ? uniq : undefined;
}
