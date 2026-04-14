import * as fs from "fs/promises";
import * as path from "path";
import type {
  MemorSystem,
  InternalStructure,
  InternalZone,
  InternalZoneKind,
  InternalDependency,
} from "../types";
import { pathExists, readTextSafe } from "../utils/file";
import { slugify } from "../utils/text";

const MAX_ZONES = 20;
const MAX_FILES_PER_ZONE = 20;
const MAX_TOTAL_SCAN = 150;

const SKIP = new Set([
  "node_modules", ".git", ".next", ".turbo", "dist", "build", "out",
  ".cache", ".vercel", "coverage", "__pycache__", ".husky", ".github",
  ".vscode", ".idea", ".svelte-kit", ".nuxt",
]);

const ZONE_MAP: Record<string, { kind: InternalZoneKind; label: string; imp: number }> = {
  components:  { kind: "ui",       label: "Components",  imp: 0.7  },
  ui:          { kind: "ui",       label: "UI",          imp: 0.65 },
  client:      { kind: "ui",       label: "Client",      imp: 0.65 },
  frontend:    { kind: "ui",       label: "Frontend",    imp: 0.65 },
  pages:       { kind: "ui",       label: "Pages",       imp: 0.6  },
  templates:   { kind: "ui",       label: "Templates",   imp: 0.5  },
  widgets:     { kind: "ui",       label: "Widgets",     imp: 0.55 },
  hooks:       { kind: "logic",    label: "Hooks",       imp: 0.7  },
  lib:         { kind: "logic",    label: "Lib",         imp: 0.65 },
  utils:       { kind: "support",  label: "Utils",       imp: 0.4  },
  helpers:     { kind: "support",  label: "Helpers",     imp: 0.35 },
  services:    { kind: "logic",    label: "Services",    imp: 0.7  },
  api:         { kind: "api",      label: "API",         imp: 0.7  },
  backend:     { kind: "api",      label: "Backend",     imp: 0.65 },
  routes:      { kind: "api",      label: "Routes",      imp: 0.7  },
  router:      { kind: "api",      label: "Router",      imp: 0.65 },
  controllers: { kind: "api",      label: "Controllers", imp: 0.7  },
  handlers:    { kind: "api",      label: "Handlers",    imp: 0.65 },
  resolvers:   { kind: "api",      label: "Resolvers",   imp: 0.65 },
  graphql:     { kind: "api",      label: "GraphQL",     imp: 0.65 },
  restapi:     { kind: "api",      label: "REST API",    imp: 0.65 },
  providers:   { kind: "provider", label: "Providers",   imp: 0.65 },
  context:     { kind: "provider", label: "Context",     imp: 0.6  },
  contexts:    { kind: "provider", label: "Contexts",    imp: 0.6  },
  store:       { kind: "state",    label: "Store",       imp: 0.65 },
  state:       { kind: "state",    label: "State",       imp: 0.65 },
  redux:       { kind: "state",    label: "Redux",       imp: 0.6  },
  styles:      { kind: "support",  label: "Styles",      imp: 0.3  },
  css:         { kind: "support",  label: "Styles",      imp: 0.3  },
  public:      { kind: "support",  label: "Public",      imp: 0.2  },
  assets:      { kind: "support",  label: "Assets",      imp: 0.25 },
  static:      { kind: "support",  label: "Static",      imp: 0.2  },
  images:      { kind: "support",  label: "Images",      imp: 0.15 },
  config:      { kind: "config",   label: "Config",      imp: 0.35 },
  configs:     { kind: "config",   label: "Config",      imp: 0.35 },
  terraform:   { kind: "config",   label: "Terraform",   imp: 0.45 },
  infra:       { kind: "config",   label: "Infra",       imp: 0.45 },
  infrastructure: { kind: "config", label: "Infra",      imp: 0.45 },
  k8s:         { kind: "config",   label: "Kubernetes",  imp: 0.45 },
  kubernetes:  { kind: "config",   label: "Kubernetes",  imp: 0.45 },
  helm:        { kind: "config",   label: "Helm",        imp: 0.45 },
  env:         { kind: "config",   label: "Env",         imp: 0.3  },
  types:       { kind: "support",  label: "Types",       imp: 0.35 },
  interfaces:  { kind: "support",  label: "Interfaces",  imp: 0.3  },
  middleware:  { kind: "logic",    label: "Middleware",   imp: 0.6  },
  server:      { kind: "api",      label: "Server",      imp: 0.65 },
  actions:     { kind: "logic",    label: "Actions",     imp: 0.6  },
  data:        { kind: "logic",    label: "Data",        imp: 0.6  },
  models:      { kind: "logic",    label: "Models",      imp: 0.55 },
  schemas:     { kind: "logic",    label: "Schemas",     imp: 0.5  },
  database:    { kind: "logic",    label: "Database",    imp: 0.6  },
  db:          { kind: "logic",    label: "Database",    imp: 0.6  },
  migrations:  { kind: "logic",    label: "Migrations",  imp: 0.5  },
  seeds:       { kind: "logic",    label: "Seeds",       imp: 0.35 },
  workers:     { kind: "logic",    label: "Workers",     imp: 0.6  },
  jobs:        { kind: "logic",    label: "Jobs",        imp: 0.6  },
  queues:      { kind: "logic",    label: "Queues",      imp: 0.55 },
  tasks:       { kind: "logic",    label: "Tasks",       imp: 0.55 },
  plugins:     { kind: "logic",    label: "Plugins",     imp: 0.6  },
  extensions:  { kind: "logic",    label: "Extensions",  imp: 0.55 },
  adapters:    { kind: "logic",    label: "Adapters",    imp: 0.55 },
  integrations: { kind: "logic",   label: "Integrations", imp: 0.55 },
  events:      { kind: "logic",    label: "Events",      imp: 0.55 },
  commands:    { kind: "logic",    label: "Commands",    imp: 0.55 },
  constants:   { kind: "support",  label: "Constants",   imp: 0.3  },
  shared:      { kind: "logic",    label: "Shared",      imp: 0.5  },
  common:      { kind: "logic",    label: "Common",      imp: 0.5  },
  features:    { kind: "feature-area", label: "Features", imp: 0.7 },
  modules:     { kind: "logic",    label: "Modules",     imp: 0.55 },
  layouts:     { kind: "ui",       label: "Layouts",     imp: 0.5  },
  views:       { kind: "ui",       label: "Views",       imp: 0.55 },
  scripts:     { kind: "support",  label: "Scripts",     imp: 0.35 },
  bin:         { kind: "logic",    label: "CLI",         imp: 0.6  },
  cli:         { kind: "logic",    label: "CLI",         imp: 0.65 },
};

const ROUTE_DIRS = new Set(["app", "pages"]);
const FEATURE_SKIP = new Set([
  "api", "_app", "_document", "_error", "layout", "page", "loading",
  "error", "not-found", "global-error", "favicon.ico", "opengraph-image",
]);
const SRC_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs", "mts"]);
const IMPORT_RE = /(?:import\s[\s\S]*?from\s+|import\s*\(|require\s*\()['"]([^'"]+)['"]/g;

// ── Helpers ───────────────────────────────────────────────────────────

async function subdirs(dir: string): Promise<{ name: string; full: string }[]> {
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    return ents
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
      .map((e) => ({ name: e.name, full: path.join(dir, e.name) }));
  } catch {
    return [];
  }
}

async function countFiles(dir: string, maxDepth = 4): Promise<number> {
  let n = 0;
  async function walk(d: string, depth: number) {
    if (depth > maxDepth) return;
    try {
      const ents = await fs.readdir(d, { withFileTypes: true });
      for (const e of ents) {
        if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
        if (e.isDirectory()) await walk(path.join(d, e.name), depth + 1);
        else n++;
      }
    } catch {}
  }
  await walk(dir, 0);
  return n;
}

async function sourceFiles(dir: string, max: number): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string, depth: number) {
    if (out.length >= max || depth > 3) return;
    try {
      const ents = await fs.readdir(d, { withFileTypes: true });
      for (const e of ents) {
        if (out.length >= max) return;
        if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
        const fp = path.join(d, e.name);
        if (e.isDirectory()) await walk(fp, depth + 1);
        else if (SRC_EXTS.has(path.extname(e.name).slice(1).toLowerCase())) out.push(fp);
      }
    } catch {}
  }
  await walk(dir, 0);
  return out;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Detection ─────────────────────────────────────────────────────────

async function findCodeRoot(sysAbs: string): Promise<string> {
  const src = path.join(sysAbs, "src");
  if (await pathExists(src)) {
    try {
      const st = await fs.stat(src);
      if (st.isDirectory()) {
        const sd = await subdirs(src);
        if (sd.length > 0) return src;
      }
    } catch {}
  }
  return sysAbs;
}

const ENTRY_FILES: { glob: string; label: string; imp: number }[] = [
  { glob: "app/layout.tsx",    label: "Root Layout",  imp: 0.9  },
  { glob: "app/layout.jsx",    label: "Root Layout",  imp: 0.9  },
  { glob: "app/layout.ts",     label: "Root Layout",  imp: 0.9  },
  { glob: "app/page.tsx",      label: "Home Page",    imp: 0.85 },
  { glob: "app/page.jsx",      label: "Home Page",    imp: 0.85 },
  { glob: "pages/_app.tsx",    label: "App Entry",    imp: 0.9  },
  { glob: "pages/_app.jsx",    label: "App Entry",    imp: 0.9  },
  { glob: "pages/index.tsx",   label: "Home Page",    imp: 0.85 },
  { glob: "pages/index.jsx",   label: "Home Page",    imp: 0.85 },
  { glob: "middleware.ts",     label: "Middleware",    imp: 0.65 },
  { glob: "middleware.js",     label: "Middleware",    imp: 0.65 },
  { glob: "index.ts",          label: "Main Entry",   imp: 0.8  },
  { glob: "index.tsx",         label: "Main Entry",   imp: 0.8  },
  { glob: "main.ts",           label: "Main Entry",   imp: 0.8  },
  { glob: "main.tsx",          label: "Main Entry",   imp: 0.8  },
];

async function detectEntries(
  codeRoot: string,
  codeRootRel: string
): Promise<InternalZone[]> {
  const out: InternalZone[] = [];
  const seen = new Set<string>();
  for (const ef of ENTRY_FILES) {
    if (await pathExists(path.join(codeRoot, ef.glob))) {
      if (seen.has(ef.label)) continue;
      seen.add(ef.label);
      out.push({
        id: `zone-entry-${slugify(ef.label)}`,
        label: ef.label,
        kind: "entry",
        path: codeRootRel ? `${codeRootRel}/${ef.glob}` : ef.glob,
        fileCount: 1,
        importance: ef.imp,
      });
    }
  }
  return out.slice(0, 4);
}

async function detectFeatureAreas(
  codeRoot: string,
  routeDir: string,
  codeRootRel: string
): Promise<InternalZone[]> {
  const rp = path.join(codeRoot, routeDir);
  if (!(await pathExists(rp))) return [];
  const dirs = await subdirs(rp);
  const zones: InternalZone[] = [];

  for (const d of dirs) {
    if (FEATURE_SKIP.has(d.name)) continue;
    const clean = d.name.replace(/^\((.+)\)$/, "$1");
    const fc = await countFiles(d.full);
    if (fc === 0) continue;
    zones.push({
      id: `zone-feature-${slugify(clean)}`,
      label: cap(clean),
      kind: "feature-area",
      path: codeRootRel ? `${codeRootRel}/${routeDir}/${d.name}` : `${routeDir}/${d.name}`,
      fileCount: fc,
      importance: Math.min(0.5 + fc * 0.02, 0.8),
    });
  }

  const apiPath = path.join(rp, "api");
  if (await pathExists(apiPath)) {
    const fc = await countFiles(apiPath);
    if (fc > 0) {
      zones.push({
        id: "zone-api-routes",
        label: "API Routes",
        kind: "api",
        path: codeRootRel ? `${codeRootRel}/${routeDir}/api` : `${routeDir}/api`,
        fileCount: fc,
        importance: 0.7,
      });
    }
  }

  zones.sort((a, b) => b.fileCount - a.fileCount);
  return zones.slice(0, 6);
}

const ADAPTIVE_SKIP = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  ".cache", "coverage", "__pycache__", "test", "tests", "__tests__",
  "__mocks__", "fixtures", "e2e", ".github", ".vscode", ".idea",
  "storybook-static", "archived", ".storybook", "vendor", "tmp", "temp",
]);

function inferZoneKind(name: string): InternalZoneKind {
  const lower = name.toLowerCase();
  if (/^(vite-plugin|plugin|extension|addon)/.test(lower)) return "logic";
  if (/^(cli|bin|cmd|command)/.test(lower)) return "logic";
  if (/^(runtime|engine|core)/.test(lower)) return "logic";
  if (/^(render|template|view|layout|page)/.test(lower)) return "ui";
  if (/^(route|router|routing)/.test(lower)) return "logic";
  if (/^(content|loader|data|model|schema)/.test(lower)) return "logic";
  if (/^(i18n|intl|locale|transition|animation)/.test(lower)) return "logic";
  if (/^(toolbar|devtool|inspector)/.test(lower)) return "support";
  if (/^(config|env|setting|preference)/.test(lower)) return "config";
  if (/^(type|interface|declaration)/.test(lower)) return "support";
  if (/^(infra|terraform|k8s|kubernetes|helm|deploy|ops)/.test(lower)) return "config";
  if (/^(worker|job|queue|task|event|command)/.test(lower)) return "logic";
  if (/^(page|screen|view|template|widget)/.test(lower)) return "ui";
  if (/(plugin|extension|addon|integration|adapter)$/.test(lower)) return "logic";
  return "logic";
}

async function detectZones(
  codeRoot: string,
  codeRootRel: string
): Promise<InternalZone[]> {
  const dirs = await subdirs(codeRoot);
  const zones: InternalZone[] = [];
  const adaptive: InternalZone[] = [];

  for (const d of dirs) {
    const lower = d.name.toLowerCase();
    if (ROUTE_DIRS.has(lower)) continue;
    if (ADAPTIVE_SKIP.has(lower)) continue;

    const fc = await countFiles(d.full);
    if (fc === 0) continue;

    const match = ZONE_MAP[lower];
    if (match) {
      zones.push({
        id: `zone-${slugify(d.name)}`,
        label: match.label,
        kind: match.kind,
        path: codeRootRel ? `${codeRootRel}/${d.name}` : d.name,
        fileCount: fc,
        importance: match.imp,
      });
    } else if (fc >= 3) {
      adaptive.push({
        id: `zone-${slugify(d.name)}`,
        label: cap(d.name),
        kind: inferZoneKind(d.name),
        path: codeRootRel ? `${codeRootRel}/${d.name}` : d.name,
        fileCount: fc,
        importance: Math.min(0.35 + fc * 0.015, 0.65),
      });
    }
  }

  // Merge: known zones first, then adaptive fill up to cap
  zones.sort((a, b) => b.importance - a.importance || b.fileCount - a.fileCount);
  adaptive.sort((a, b) => b.fileCount - a.fileCount);

  const result = [...zones];
  for (const az of adaptive) {
    if (result.length >= 14) break;
    result.push(az);
  }

  return result;
}

// ── Import Scanning ───────────────────────────────────────────────────

function resolveToZone(
  imp: string,
  fromFile: string,
  codeRoot: string,
  lookup: Map<string, string>
): string | null {
  if (!imp.startsWith(".") && !imp.startsWith("@/") && !imp.startsWith("~/")) {
    return null;
  }

  let seg: string;
  if (imp.startsWith("@/") || imp.startsWith("~/")) {
    seg = imp.slice(2).split("/")[0].toLowerCase();
  } else {
    const resolved = path.resolve(path.dirname(fromFile), imp);
    const rel = path.relative(codeRoot, resolved);
    if (rel.startsWith("..")) return null;
    seg = rel.split(path.sep)[0].toLowerCase();
  }

  return lookup.get(seg) || null;
}

async function scanImports(
  zones: InternalZone[],
  codeRoot: string,
  sysAbs: string
): Promise<InternalDependency[]> {
  const lookup = new Map<string, string>();
  for (const z of zones) {
    const dirName = path.basename(z.path).toLowerCase();
    lookup.set(dirName, z.id);
  }

  const counts = new Map<string, number>();
  let total = 0;
  const scannable = zones.filter(
    (z) => z.kind !== "support" && z.kind !== "config"
  );

  for (const zone of scannable) {
    if (total >= MAX_TOTAL_SCAN) break;
    const absPath = path.join(sysAbs, zone.path);
    let files: string[];

    if (zone.kind === "entry") {
      const fp = path.join(sysAbs, zone.path);
      files = (await pathExists(fp)) ? [fp] : [];
    } else {
      files = await sourceFiles(absPath, MAX_FILES_PER_ZONE);
    }

    for (const file of files) {
      if (total >= MAX_TOTAL_SCAN) break;
      total++;
      const content = await readTextSafe(file, 50 * 1024);
      if (!content) continue;

      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(content)) !== null) {
        const tid = resolveToZone(m[1], file, codeRoot, lookup);
        if (tid && tid !== zone.id) {
          const key = `${zone.id}\u2192${tid}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([key, count]) => {
      const [src, tgt] = key.split("\u2192");
      return { sourceZoneId: src, targetZoneId: tgt, importCount: count };
    })
    .sort((a, b) => b.importCount - a.importCount);
}

// ── Main ──────────────────────────────────────────────────────────────

export async function buildInternalArchitecture(
  system: MemorSystem,
  repoRoot: string
): Promise<InternalStructure | null> {
  const sysAbs =
    system.rootPath === "." ? repoRoot : path.resolve(repoRoot, system.rootPath);
  if (!(await pathExists(sysAbs))) return null;

  const codeRoot = await findCodeRoot(sysAbs);
  const codeRootRel = path.relative(sysAbs, codeRoot) || "";

  const entries = await detectEntries(codeRoot, codeRootRel);

  let features: InternalZone[] = [];
  for (const rd of ROUTE_DIRS) {
    features.push(...(await detectFeatureAreas(codeRoot, rd, codeRootRel)));
  }

  const zones = await detectZones(codeRoot, codeRootRel);

  let all = [...entries, ...features, ...zones];
  const seenIds = new Set<string>();
  all = all.filter((z) => {
    if (seenIds.has(z.id)) return false;
    seenIds.add(z.id);
    return true;
  });

  if (all.length > MAX_ZONES) {
    all.sort((a, b) => b.importance - a.importance);
    all = all.slice(0, MAX_ZONES);
  }

  if (all.length < 2) return null;

  const deps = await scanImports(all, codeRoot, sysAbs);

  return { zones: all, dependencies: deps };
}
