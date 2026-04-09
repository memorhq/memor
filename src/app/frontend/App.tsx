import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { AppData, ChangeImpactResult } from "./types";

// ── Dock ─────────────────────────────────────────────────────────────

type DockItem = {
  id: string;
  label: string;
  color: string;
  svg: string;
};

const DOCK_ITEMS: DockItem[] = [
  { id: "overview",  label: "Overview",  color: "#4338ca",
    svg: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>` },
  { id: "structure", label: "Structure", color: "#0369a1",
    svg: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="3" r="2"/><circle cx="4" cy="13" r="2"/><circle cx="12" cy="13" r="2"/><line x1="8" y1="5" x2="4" y2="11"/><line x1="8" y1="5" x2="12" y2="11"/></svg>` },
  { id: "flow",      label: "Flow",      color: "#7c3aed",
    svg: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h9"/><polyline points="8 5 11 8 8 11"/><line x1="14" y1="3" x2="14" y2="13"/></svg>` },
  { id: "impact",    label: "Impact",    color: "#dc2626",
    svg: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r="0.5" fill="currentColor"/></svg>` },
];

// ── Overview helpers ─────────────────────────────────────────────────

function extractIdentity(data: AppData): string {
  const mode = data.analysis.repoMode;
  const name = data.analysis.repoName.toLowerCase();
  const zones = data.repoStory?.zones || [];
  const zoneNames = zones.map(z => z.name.toLowerCase());
  const frameworks = (data.analysis.summary?.detectedFrameworks || []).map(f => f.toLowerCase());
  const hasZone = (kw: string) => zoneNames.some(z => z.includes(kw));
  const hasFw = (kw: string) => frameworks.some(f => f.includes(kw));

  if (mode === "framework-core" || mode === "framework-core-single") {
    if (hasFw("react") || name === "react") return "UI engine that powers how apps render and update the screen";
    if (hasFw("svelte") || name === "svelte") return "Compiler-first framework that turns components into fast DOM updates";
    if (hasFw("vue") || name === "vue") return "Progressive framework for building interactive user interfaces";
    if (hasFw("angular") || name === "angular") return "Platform for building structured, scalable web applications";
    if (hasFw("astro") || name === "astro") return "Content-first web framework that ships minimal JavaScript";
    if (hasFw("next") || name.includes("next")) return "Full-stack React framework for production web applications";
    if (hasFw("nest") || name.includes("nest")) return "Server-side framework for building scalable Node.js services";
    if (hasZone("compiler") || hasZone("runtime")) return "Framework engine with compiler and runtime layers";
    return "Framework that provides core primitives for building applications";
  }
  if (mode === "product-web-app" || mode === "product-web-app-with-bff") {
    if (hasZone("dashboard") && hasZone("api")) return "Product app with dashboard interface backed by API routes";
    if (hasZone("dashboard")) return "Product app with authenticated dashboard experience";
    if (hasFw("next")) return "Next.js product app that serves users through web interfaces";
    return "Web application that delivers product functionality to users";
  }
  if (mode === "product-domain-machine") {
    const runnables = data.analysis.systems.filter(s => (s as any).runtimeRole === "runnable" || s.type === "application").slice(0, 3).map(s => s.name);
    if (runnables.length > 0) return `Product monorepo powering ${runnables.join(", ")} from shared domain logic`;
    return "Product monorepo with multiple apps backed by shared packages";
  }
  if (mode === "library") return "Reusable library that other projects depend on";
  const hl = data.ahaSummary?.headline || "";
  const match = hl.match(/is\s+(?:a\s+)?(.+?)\.?\s*$/i);
  if (match) return match[1].trim().replace(/\.$/, "").replace(/centered on\s+/, "built on ");
  return "Codebase with structured modules and clear architecture";
}

function buildFlowSteps(data: AppData): string[] | null {
  const flows = data.repoStory?.flows;
  if (!flows || flows.length === 0) return null;
  const primary = flows[0];
  if (!primary.steps || primary.steps.length < 2) return null;
  return primary.steps.slice(0, 5).map((s, i) => {
    let l = s.label;
    l = l.replace(/^Host application or framework consumer imports this package$/i, "App imports");
    l = l.replace(/^Package exports runtime,? utilities,? or extension points$/i, "Exposes API");
    l = l.replace(/^Behavior materializes in the host's process.*$/i, "Renders to host");
    l = l.replace(/^Import react.*$/i, "App imports React");
    l = l.replace(/^Renderer entry.*$/i, "Renderer binds");
    l = l.replace(/^Schedule & reconcile.*$/i, "Reconciles changes");
    l = l.replace(/^Commit to host.*$/i, "Updates DOM");
    if (l.length > 28) l = l.replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (l.length > 28) l = l.split(/\s+/).slice(0, 4).join(" ");
    if (i === 0 && !/^(user|app|dev)\s/i.test(l)) {
      l = "User " + l.charAt(0).toLowerCase() + l.slice(1);
    }
    return l;
  });
}

function humanizeWarning(data: AppData): string | null {
  const aha = data.ahaSummary;
  if (!aha) return null;
  const score = aha.glance?.highestRiskScore;
  const name = aha.glance?.highestRiskSystem;
  const couplings = aha.glance?.strongCouplings || 0;
  const keyCouplings = data.repoStory?.keyCouplings || [];
  const dependents = keyCouplings.filter(c => c.to === name && c.strength === "high").map(c => c.from);
  const depList = [...new Set(dependents)].slice(0, 3);
  if (score != null && score >= 70 && depList.length > 0) return `Changes here propagate to ${depList.join(", ")} and ${dependents.length > 3 ? "more" : "others"}`;
  if (score != null && score >= 70 && name) {
    const zones = data.repoStory?.zones || [];
    const az = zones.filter(z => z.systemNames?.some(s => s === name || dependents.includes(s))).map(z => z.name).slice(0, 2);
    if (az.length > 0) return `Changes ripple across ${az.join(" and ")}`;
    return `${name} is a high-coupling hub — most systems depend on it`;
  }
  if (score != null && score >= 40 && name) return depList.length > 0 ? `${name} is tightly coupled with ${depList.join(", ")}` : `${name} touches multiple zones — changes ripple`;
  if (couplings >= 5) return `${couplings} strong couplings detected across the architecture`;
  if (aha.warnings && aha.warnings.length > 0) {
    let w = aha.warnings[0];
    w = w.replace(/\s*\(\d+\/\d+\)\s*/g, " ").replace(/\s*—\s*changes propagate widely\.?/i, "");
    if (w.match(/blast radius/i) && depList.length > 0) return `Changes here propagate to ${depList.join(", ")}`;
    return w;
  }
  return null;
}

const TECH_LABELS: Record<string, string> = {
  next: "Next.js", "next.js": "Next.js", react: "React", "react-dom": "",
  svelte: "Svelte", vue: "Vue", angular: "Angular", astro: "Astro",
  nuxt: "Nuxt", remix: "Remix", nest: "NestJS", nestjs: "NestJS",
  express: "Express", fastify: "Fastify", hono: "Hono",
  typescript: "TypeScript", node: "Node", deno: "Deno", bun: "Bun",
  tailwind: "Tailwind", tailwindcss: "Tailwind",
  prisma: "Prisma", drizzle: "Drizzle", graphql: "GraphQL",
  trpc: "tRPC", monorepo: "Monorepo", turborepo: "Turborepo",
  lerna: "Lerna", pnpm: "pnpm", bff: "BFF Layer",
  vite: "Vite", webpack: "Webpack", esbuild: "esbuild", rollup: "Rollup",
};
const TECH_IGNORE = new Set(["react-dom", "npm-workspaces", "pnpm-workspaces", "yarn-workspaces"]);
const TECH_PRIORITY = ["react", "next.js", "svelte", "vue", "angular", "astro", "nuxt", "remix", "nestjs", "express"];

function extractTechChips(data: AppData): string[] {
  const seen = new Set<string>(); const chips: string[] = [];
  const add = (label: string) => { const k = label.toLowerCase(); if (seen.has(k) || !label) return; seen.add(k); chips.push(label); };
  const allTech = new Map<string, number>();
  for (const sys of data.analysis.systems) for (const t of sys.detectedTech || []) { const k = t.toLowerCase(); allTech.set(k, (allTech.get(k) || 0) + 1); }
  for (const pKey of TECH_PRIORITY) { if (chips.length >= 4) break; for (const [raw] of allTech) { if (raw.includes(pKey) || pKey.includes(raw)) { const m = TECH_LABELS[raw] || TECH_LABELS[pKey]; if (m && m !== "") add(m); break; } } }
  const frameworks = data.analysis.summary?.detectedFrameworks || [];
  for (const fw of frameworks) { if (chips.length >= 4) break; const k = fw.toLowerCase(); if (TECH_IGNORE.has(k)) continue; const m = Object.entries(TECH_LABELS).find(([kk]) => k.includes(kk)); if (m && m[1]) add(m[1]); }
  for (const lang of ["typescript", "javascript"]) { if (chips.length >= 4 && chips.length > 0) break; if (allTech.has(lang)) add(lang === "typescript" ? "TypeScript" : "JavaScript"); }
  for (const bt of ["webpack", "rollup", "vite", "esbuild"]) { if (chips.length >= 4) break; if (allTech.has(bt)) add(TECH_LABELS[bt] || bt); }
  const mode = data.analysis.repoMode;
  if (chips.length < 2) { if (mode.includes("web-app")) add("Web App"); if (mode.includes("monorepo") || mode.includes("domain-machine")) add("Monorepo"); }
  return chips.slice(0, 4);
}

function entryHint(reason: string | null, path?: string | null): string {
  if (reason) {
    const r = reason.replace(/\.$/, "").toLowerCase();
    if (r.includes("index export")) return "public entry — start reading here";
    if (r.includes("package root")) return "package root — where dependencies land";
    if (r.includes("app shell") || r.includes("layout")) return "app shell — wraps all pages";
    if (r.includes("route")) return "route entry — maps URLs to handlers";
    if (r.includes("main")) return "main entry — app starts here";
    if (r.length <= 40) return r;
  }
  if (path) {
    const p = path.toLowerCase();
    if (/hooks?\/?$/i.test(p)) return "shared hooks layer used across features";
    if (/components?\/?$/i.test(p)) return "component library shared across views";
    if (/utils?\/?$/i.test(p)) return "shared utilities consumed by other modules";
    if (/lib\/?$/i.test(p)) return "core library — foundational logic lives here";
    if (/api\/?$/i.test(p)) return "API layer — handles external requests";
    if (/src\/?$/i.test(p)) return "source root — main code starts here";
    if (/app\/?$/i.test(p)) return "app root — application entry point";
    if (/server\/?$/i.test(p)) return "server entry — handles incoming requests";
    if (/pages?\/?$/i.test(p)) return "page routes — URL-mapped views";
  }
  return "";
}

// ── Overview Card ────────────────────────────────────────────────────

function CenterSeedCard({ data }: { data: AppData }) {
  const repoName = data.analysis.repoName;
  const identity = extractIdentity(data);
  const techChips = extractTechChips(data);
  const flowSteps = buildFlowSteps(data);
  const startPath = data.repoStory?.recommendedStart || null;
  const startReason = data.repoStory?.startReason || null;
  const warning = humanizeWarning(data);
  const zones = data.repoStory?.zones || [];
  const hint = entryHint(startReason, startPath);
  const q = data.quality;
  const [showConcerns, setShowConcerns] = React.useState(false);
  const icons = (data as any).techIcons as Record<string, string> | undefined;

  const systems = data.analysis.systems;
  const tc = useMemo(() => {
    const c = { primary: 0, secondary: 0, support: 0 };
    for (const s of systems) c[s.systemTier as keyof typeof c]++;
    return c;
  }, [systems]);

  const highestImpact = useMemo(() => {
    const ir = data.impactResults;
    if (!ir) return null;
    let best: { name: string; level: string; count: number } | null = null;
    for (const r of Object.values(ir)) {
      const total = r.directImpacts.length + r.indirectImpacts.length;
      if (!best || r.blastRadiusScore > (data.impactResults?.[best.name]?.blastRadiusScore ?? 0) || total > best.count) {
        best = { name: r.selectedSystem, level: r.blastRadiusLevel, count: total };
      }
    }
    if (best && best.count < 2) return null;
    return best;
  }, [data.impactResults]);

  const topCouplings = useMemo(() => {
    const kc = data.repoStory?.keyCouplings || [];
    return kc.filter(c => c.strength === "high" || c.strength === "medium").slice(0, 2);
  }, [data.repoStory?.keyCouplings]);

  const hasFlow = !!flowSteps;
  const hasEntry = !!startPath;
  const hasZones = zones.length > 0;
  const hasSignals = !!(highestImpact || topCouplings.length > 0);
  const hasQuality = !!(q && q.confidence !== "high");

  return (
    <div className="seed-galaxy">
      <div className="seed-card seed-card-identity">
        <div className="seed-header">
          {data.logoDataUri && <img className="seed-logo" src={data.logoDataUri} alt="" />}
          <span className="seed-name">{repoName}</span>
        </div>
        <div className="seed-chips">
          {techChips.map(t => (
            <span key={t} className="seed-chip">
              {icons?.[t] && <img className="seed-chip-icon" src={icons[t]} alt="" />}
              {t}
            </span>
          ))}
        </div>
        <div className="seed-identity">{identity}</div>
        <div className="seed-stats">
          <span>{systems.length} systems</span>
          <span className="seed-stats-detail">
            {tc.primary} primary · {tc.secondary} secondary · {tc.support} support
          </span>
          {zones.length > 0 && (
            <><span className="seed-stats-sep">·</span><span>{zones.length} zone{zones.length !== 1 ? "s" : ""}</span></>
          )}
        </div>
        {hasQuality && (
          <div className={`qa-banner qa-${q!.confidence}`}>
            <div className="qa-banner-row">
              <span className="qa-icon">{q!.confidence === "low" ? "⚠" : "ℹ"}</span>
              <span className="qa-label">{q!.confidence === "low" ? "Low" : "Moderate"} confidence</span>
              <span className="qa-metric">{q!.metrics.connectedSystems}/{q!.metrics.totalSystems} connected</span>
              {q!.concerns.length > 0 && (
                <button className="qa-toggle" onClick={() => setShowConcerns(!showConcerns)}>
                  {showConcerns ? "Hide" : "Why?"}
                </button>
              )}
            </div>
            {showConcerns && q!.concerns.length > 0 && (
              <div className="qa-concerns">
                {q!.concerns.map((c, i) => (
                  <div key={i} className="qa-concern"><span className="qa-concern-dot">·</span><span>{c.detail}</span></div>
                ))}
                <div className="qa-suggestion">{q!.suggestion}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {(hasFlow || hasEntry) && (
        <div className="seed-card seed-card-flow">
          {hasFlow && (<>
            <span className="seed-label">Flow</span>
            <div className="seed-flow">
              {flowSteps!.map((step, i) => (
                <div key={i} className={`seed-flow-row${i === flowSteps!.length - 1 ? " seed-flow-end" : ""}`} style={{ paddingLeft: `${i * 14}px` }}>
                  {i > 0 && <span className="seed-flow-arrow">→</span>}
                  <span className="seed-flow-step">{step}</span>
                </div>
              ))}
            </div>
          </>)}
          {hasEntry && (
            <div className={hasFlow ? "seed-entry-section" : ""}>
              <span className="seed-label seed-label-entry">Entry Point</span>
              <div className="seed-entry">
                <code className="seed-entry-path">{startPath}</code>
                {hint && <span className="seed-entry-hint">{hint}</span>}
              </div>
              {warning && <p className="seed-warning-text">{warning}</p>}
            </div>
          )}
        </div>
      )}

      {hasZones && (
        <div className="seed-card seed-card-zones">
          <span className="seed-label">Architecture ({zones.length} zone{zones.length !== 1 ? "s" : ""})</span>
          <div className="seed-zones">
            {zones.map(z => (
              <div key={z.name} className="seed-zone">
                <span className="seed-zone-name">{z.name}</span>
                <span className="seed-zone-count">{z.systemNames?.length || z.systemIds?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSignals && (
        <div className="seed-card seed-card-signals">
          <span className="seed-label">Key Signals</span>
          <div className="seed-signal-list">
            {highestImpact && (
              <div className="seed-signal">
                <span className="seed-signal-icon">⚡</span>
                <span><strong>{highestImpact.name}</strong> impacts {highestImpact.count} system{highestImpact.count !== 1 ? "s" : ""} — {highestImpact.level === "high" ? "high" : highestImpact.level} blast radius</span>
              </div>
            )}
            {topCouplings.map((c, i) => {
              const suffixes = [
                "changes may ripple across dependent modules",
                "expect updates in connected services",
                "modifications here tend to propagate",
              ];
              const tail = c.reason
                ? (c.reason.split("—")[1]?.trim() || c.reason.split(".")[0])
                : suffixes[i % suffixes.length];
              return (
                <div key={i} className="seed-signal">
                  <span className="seed-signal-icon">{c.strength === "high" ? "🔴" : "🟡"}</span>
                  <span><strong>{c.from}</strong> and <strong>{c.to}</strong> are tightly coupled — {tail}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!hasFlow && !hasEntry && !hasZones && !hasSignals && (
        <div className="seed-card seed-card-sparse">
          <div className="seed-sparse">Use Structure, Flow, or Impact views for deeper analysis.</div>
        </div>
      )}
    </div>
  );
}

// ── Structure View ───────────────────────────────────────────────────

type NavLevel = { kind: "root" } | { kind: "zone"; zoneName: string };

function humanizeRelation(rel: string): string {
  const r = rel.toLowerCase().replace(/[_-]/g, " ");
  if (r === "extends") return "builds on";
  if (r === "uses") return "relies on";
  if (r === "used by") return "consumed by";
  if (r === "bridges") return "connects to";
  return r;
}

function deriveUsedWhen(sys: MemorSystem): string {
  const role = (sys as any).inferredSupportRole || "";
  const type = sys.type || "";
  const name = sys.name.toLowerCase();

  if (role === "test-harness") return "Adding tests or validating changes";
  if (role === "devtools-instrumentation") return "Debugging or profiling runtime behavior";
  if (role === "development-tooling") return "Enforcing code quality or running linters";
  if (role === "build-pipeline" || role === "build-tooling") return "Building, bundling, or publishing packages";
  if (role === "runtime-support") return "Other packages need shared utilities at runtime";

  if (name.includes("server")) return "Server-side rendering or streaming responses";
  if (name.includes("client")) return "Client-side hydration or browser rendering";
  if (name.includes("compiler")) return "Compiling source code into optimized output";
  if (name.includes("devtools") || name.includes("debug")) return "Inspecting, profiling, or debugging at runtime";
  if (name.includes("test") || name.includes("mock") || name.includes("fixture")) return "Writing or running tests";
  if (name.includes("cli") || name.includes("create-")) return "Scaffolding new projects or running commands";

  if (type === "web-app" || type === "application") return "Building or modifying user-facing features";
  if (type === "shared-package" || type === "library") {
    if (sys.systemTier === "primary") return "Extending or modifying core functionality";
    return "Changing shared behavior used across the codebase";
  }

  return "";
}

function radialPositions(count: number, radius: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (2 * Math.PI * i) / count;
    positions.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return positions;
}

function StructureView({ data, onBack }: { data: AppData; onBack: () => void }) {
  const zones = data.repoStory?.zones || [];
  const [navStack, setNavStack] = useState<NavLevel[]>([{ kind: "root" }]);
  const current = navStack[navStack.length - 1];
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [canvasReady, setCanvasReady] = useState(false);
  const [entered, setEntered] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [modalZone, setModalZone] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      if (canvasRef.current) {
        const r = canvasRef.current.getBoundingClientRect();
        setDims({ w: r.width, h: r.height });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setCanvasReady(true), 30);
    return () => clearTimeout(t);
  }, []);

  const currentKey = current.kind === "zone" ? current.zoneName : "__root__";
  useEffect(() => {
    setEntered(false);
    setHoveredIdx(null);
    setSelectedId(null);
    setShowMore(false);
    setModalZone(null);
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, [currentKey]);

  const drillIntoZone = useCallback((zoneName: string) => {
    setNavStack(prev => [...prev, { kind: "zone", zoneName }]);
  }, []);

  const goBack = useCallback(() => {
    if (navStack.length > 1) {
      setNavStack(prev => prev.slice(0, -1));
    } else {
      onBack();
    }
  }, [navStack.length, onBack]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goBack();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goBack]);

  const entryZoneName = useMemo(() => {
    const center = data.analysis.repoCenter;
    if (!center) return null;
    const z = zones.find(zn => zn.systemNames?.includes(center) || zn.systemIds?.includes(center));
    return z?.name || null;
  }, [zones, data.analysis.repoCenter]);

  const centerLabel = current.kind === "root"
    ? data.analysis.repoName
    : current.zoneName;

  const centerSub = current.kind === "root"
    ? extractIdentity(data)
    : zones.find(z => z.name === current.zoneName)?.description || "";

  const centerChip = current.kind === "root"
    ? data.analysis.repoMode.replace(/-/g, " ")
    : `${zones.find(z => z.name === current.zoneName)?.systemNames?.length || 0} systems`;

  const levelHint = current.kind === "root" ? "Zones" : "Systems";

  const narrative = useMemo(() => {
    if (current.kind === "root") {
      if (zones.length === 0) return "";
      const name = data.analysis.repoName;
      const zoneFlow = zones.slice(0, 5).map(z => z.name).join("  →  ");
      return `${name} is structured around: ${zoneFlow}`;
    }
    const zone = zones.find(z => z.name === current.zoneName);
    if (!zone) return "";
    const names = (zone.systemNames || []).slice(0, 6);
    const more = (zone.systemNames?.length || 0) - names.length;
    let text = `${current.zoneName}: ${names.join(", ")}`;
    if (more > 0) text += ` +${more} more`;
    return text;
  }, [current, zones, data.analysis.repoName]);

  const ringItems = useMemo(() => {
    if (current.kind === "root") {
      return zones.slice(0, 7).map(z => {
        const count = z.systemNames?.length || z.systemIds?.length || 0;
        const zoneSystems = (z.systemNames || [])
          .map(sn => data.analysis.systems.find(s => s.name === sn))
          .filter(Boolean);
        const techSet = new Set<string>();
        for (const s of zoneSystems) {
          for (const t of (s!.detectedTech || [])) techSet.add(t);
        }
        return {
          id: z.name,
          name: z.name,
          sub: z.description?.split(".")[0] || "",
          countLabel: `${count} system${count !== 1 ? "s" : ""}`,
          clickable: true,
          sizeClass: count >= 6 ? "str-ring-lg" : count >= 3 ? "str-ring-md" : "",
          isEntry: z.name === entryZoneName,
          tier: "" as string,
          tech: Array.from(techSet).slice(0, 4),
        };
      });
    }
    const zone = zones.find(z => z.name === current.zoneName);
    if (!zone) return [];
    const sysNames = zone.systemNames || [];
    return sysNames.slice(0, 6).map(sn => {
      const sys = data.analysis.systems.find(s => s.name === sn);
      return {
        id: sn,
        name: sn,
        sub: sys?.description?.split(".")[0] || sys?.systemRoleHint || "",
        countLabel: "",
        clickable: false,
        sizeClass: "",
        isEntry: false,
        tier: sys?.systemTier || "support",
        tech: (sys?.detectedTech || []).slice(0, 4),
      };
    });
  }, [current, zones, data.analysis.systems, entryZoneName]);

  const hiddenCount = useMemo(() => {
    if (current.kind === "root") {
      return Math.max(0, zones.length - 7);
    }
    const zone = zones.find(z => z.name === current.zoneName);
    const total = zone?.systemNames?.length || 0;
    return Math.max(0, total - 6);
  }, [current, zones]);

  const hiddenItems = useMemo(() => {
    if (current.kind === "root") {
      return zones.slice(7).map(z => {
        const zoneSys = (z.systemNames || []).map(sn => data.analysis.systems.find(s => s.name === sn)).filter(Boolean);
        const techSet = new Set<string>();
        for (const s of zoneSys) { for (const t of (s!.detectedTech || [])) techSet.add(t); }
        return {
          name: z.name,
          sub: z.description?.split(".")[0] || "",
          count: z.systemNames?.length || 0,
          tech: Array.from(techSet).slice(0, 4),
          isZone: true,
        };
      });
    }
    const zone = zones.find(z => z.name === current.zoneName);
    if (!zone) return [];
    return (zone.systemNames || []).slice(6).map(sn => {
      const sys = data.analysis.systems.find(s => s.name === sn);
      return {
        name: sn,
        sub: sys?.description?.split(".")[0] || "",
        count: 0,
        tech: (sys?.detectedTech || []).slice(0, 4),
        isZone: false,
      };
    });
  }, [current, zones, data.analysis.systems]);

  const selectedSys = useMemo(() => {
    if (!selectedId) return null;
    return data.analysis.systems.find(s => s.name === selectedId) || null;
  }, [selectedId, data.analysis.systems]);

  const whyItMatters = useMemo(() => {
    if (!selectedSys) return "";
    const out = selectedSys.connections?.outgoing || [];
    const inc = selectedSys.connections?.incoming || [];
    const role = (selectedSys as any).inferredSupportRole || "";

    if (selectedSys.isRepoCenter) return "Everything in the architecture traces back to this";

    const allReasons = [...out, ...inc].map(c => c.reason || "");
    const richReason = allReasons.find(r =>
      r.length > 20 && !r.startsWith("package dependency") && !r.match(/^(single |multiple )?cross-system imports? detected$/)
    );
    if (richReason) {
      let clean = richReason.replace(/\s*\(also a direct dependency\)/gi, "").trim();
      const dashIdx = clean.indexOf("—");
      if (dashIdx > 0) {
        const after = clean.slice(dashIdx + 1).trim();
        if (after.length > 12) clean = after;
      }
      if (clean.length > 12) return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    if (role === "test-harness") return "Ensures correctness and prevents regressions";
    if (role === "devtools-instrumentation") return "Powers developer tooling and debugging experience";
    if (role === "development-tooling") return "Keeps the development workflow fast and reliable";
    if (role === "runtime-support") return "Shared runtime foundation other packages build upon";
    if (role === "build-pipeline" || role === "build-tooling") return "Transforms and bundles code for distribution";

    if (out.length > 0 && inc.length > 0) {
      return `Connects ${inc[0].targetSystemName} to ${out[0].targetSystemName}`;
    }
    if (inc.length > 0) {
      return `Shared foundation that ${inc.slice(0, 2).map(c => c.targetSystemName).join(" and ")} rely on`;
    }
    if (out.length > 0) {
      return `Built on top of ${out.slice(0, 2).map(c => c.targetSystemName).join(" and ")}`;
    }

    if (selectedSys.systemRoleHint) return selectedSys.systemRoleHint;
    return "";
  }, [selectedSys]);

  const flowPreview = useMemo(() => {
    if (!selectedId) return "";
    const flows = data.repoStory?.flows || [];
    const sysLower = selectedId.toLowerCase();
    let bestFlow: typeof flows[0] | null = null;
    let bestScore = 0;
    for (const flow of flows) {
      const steps = flow.steps || [];
      let score = 0;
      for (const s of steps) {
        if (s.label.toLowerCase().includes(sysLower)) score += 2;
        if (s.description.toLowerCase().includes(sysLower)) score += 1;
      }
      if (score > bestScore) { bestScore = score; bestFlow = flow; }
    }
    if (!bestFlow || bestScore === 0) return "";
    return bestFlow.steps.slice(0, 4).map(s => {
      let l = s.label;
      if (l.length > 28) l = l.split(/\s+/).slice(0, 4).join(" ");
      return l;
    }).join("  →  ");
  }, [selectedId, data.repoStory?.flows]);

  const usedWhen = useMemo(() => {
    if (!selectedSys) return "";
    return deriveUsedWhen(selectedSys);
  }, [selectedSys]);

  const selectedNodeIdx = selectedId ? ringItems.findIndex(r => r.id === selectedId) : -1;

  const cx = dims.w / 2;
  const cy = dims.h / 2 - 16;
  const n = ringItems.length;
  const baseRadius = n <= 2 ? 180 : n <= 4 ? 230 : n <= 5 ? 270 : 310;
  const radius = Math.min(baseRadius, Math.min(dims.w * 0.36, dims.h * 0.36));
  const positions = radialPositions(n, radius);

  const nodeCount = ringItems.length;
  const edgeBaseDelay = 100 + nodeCount * 80 + 200;

  const handleNodeClick = useCallback((item: typeof ringItems[0]) => {
    if (item.clickable) {
      drillIntoZone(item.name);
    } else {
      setSelectedId(prev => prev === item.id ? null : item.id);
    }
  }, [drillIntoZone]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("str-canvas")) {
      setSelectedId(null);
    }
  }, []);

  return (
    <div ref={canvasRef} className={`str-canvas${canvasReady ? " str-canvas-in" : ""}`} onClick={handleCanvasClick}>
      <div className="str-top">
        <button className="str-back" onClick={goBack}>← Back</button>
        <div className="str-breadcrumb">
          {navStack.map((lev, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="str-bc-sep">›</span>}
              <span
                className={`str-bc-item${i === navStack.length - 1 ? " str-bc-active" : ""}`}
                onClick={i < navStack.length - 1 ? () => setNavStack(prev => prev.slice(0, i + 1)) : undefined}
              >
                {lev.kind === "root" ? data.analysis.repoName : lev.zoneName}
              </span>
            </React.Fragment>
          ))}
          <span className="str-bc-sep">›</span>
          <span className="str-bc-level">{levelHint}</span>
        </div>
      </div>

      {narrative && (
        <div className="str-narrative">{narrative}</div>
      )}

      {n === 0 && entered && (
        <div className="str-empty-state">
          <span className="str-empty-title">No zones detected</span>
          <span className="str-empty-sub">This codebase has a flat structure — all systems belong to a single module. Try a monorepo or multi-package project for richer architecture mapping.</span>
        </div>
      )}

      <svg className="str-svg" width={dims.w} height={dims.h}>
        <defs>
          <marker id="str-arrow" viewBox="0 0 8 6" refX="7" refY="3"
            markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,3 L0,6" fill="rgba(0,0,0,.15)" />
          </marker>
          <marker id="str-arrow-active" viewBox="0 0 8 6" refX="7" refY="3"
            markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L8,3 L0,6" fill="rgba(99,102,241,.5)" />
          </marker>
        </defs>
        {entered && positions.map((pos, i) => (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={cx + pos.x} y2={cy + pos.y}
            className={`str-edge${hoveredIdx === i ? " str-edge-hot" : ""}`}
            markerEnd={hoveredIdx === i ? "url(#str-arrow-active)" : "url(#str-arrow)"}
            style={{ animationDelay: `${edgeBaseDelay + i * 50}ms` }}
          />
        ))}
      </svg>

      <div
        className={`str-center-node${entered ? " str-node-in" : ""}`}
        style={{ left: cx, top: cy }}
      >
        {data.logoDataUri && current.kind === "root" && (
          <img className="str-center-logo" src={data.logoDataUri} alt="" />
        )}
        <span className="str-center-name">{centerLabel}</span>
        <span className="str-center-chip">{centerChip}</span>
        <span className="str-center-sub">{centerSub}</span>
      </div>

      {ringItems.map((item, i) => {
        const classes = [
          "str-ring-node",
          entered ? "str-node-in" : "",
          item.clickable ? "str-clickable" : "str-selectable",
          item.sizeClass,
          item.isEntry ? "str-ring-entry" : "",
          item.tier ? `str-tier-${item.tier}` : "",
          selectedId === item.id ? "str-ring-selected" : "",
        ].filter(Boolean).join(" ");

        return (
          <div
            key={item.id}
            className={classes}
            style={{
              left: cx + positions[i].x,
              top: cy + positions[i].y,
              animationDelay: entered ? `${100 + i * 80}ms` : "0ms",
            }}
            onClick={() => handleNodeClick(item)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <span className="str-ring-name">{item.name}</span>
            {item.countLabel && <span className="str-ring-count">{item.countLabel}</span>}
            {item.sub && (
              <span className="str-ring-sub">{item.sub}</span>
            )}
            {item.tech.length > 0 && (
              <div className="str-ring-tech">
                {item.tech.map(t => {
                  const icon = data.techIcons?.[t];
                  return icon
                    ? <img key={t} className="str-ring-tech-icon" src={icon} alt={t} title={t} />
                    : <span key={t} className="str-ring-tech-chip">{t}</span>;
                })}
              </div>
            )}
            {item.clickable && (
              <span className="str-ring-explore">Click to explore →</span>
            )}
            {item.isEntry && entered && (
              <span className="str-ring-start">Start here</span>
            )}
          </div>
        );
      })}

      {hiddenCount > 0 && entered && (
        <div className="str-more-hint" onClick={() => setShowMore(true)}>
          +{hiddenCount} more system{hiddenCount !== 1 ? "s" : ""} — click to view
        </div>
      )}

      {showMore && (() => {
        const modalInZone = modalZone ? zones.find(z => z.name === modalZone) : null;
        const modalItems = modalInZone
          ? (modalInZone.systemNames || []).map(sn => {
              const sys = data.analysis.systems.find(s => s.name === sn);
              return {
                name: sn,
                sub: sys?.description?.split(".")[0] || "",
                count: 0,
                tech: (sys?.detectedTech || []).slice(0, 4),
                isZone: false,
              };
            })
          : hiddenItems;
        const modalTitle = modalInZone
          ? modalInZone.name
          : (current.kind === "root" ? "More Zones" : `More in ${current.zoneName}`);

        return (
          <div className="str-modal-overlay" onClick={() => { setShowMore(false); setModalZone(null); }}>
            <div className="str-modal" onClick={e => e.stopPropagation()}>
              <div className="str-modal-head">
                <div className="str-modal-bc">
                  {modalZone && (
                    <span className="str-modal-bc-back" onClick={() => setModalZone(null)}>← Back</span>
                  )}
                  <span className="str-modal-title">{modalTitle}</span>
                </div>
                <button className="str-detail-close" onClick={() => { setShowMore(false); setModalZone(null); }}>×</button>
              </div>
              <div className="str-modal-list">
                {modalItems.map(s => (
                  <div
                    key={s.name}
                    className={`str-modal-item${s.isZone ? " str-modal-clickable" : ""}`}
                    onClick={s.isZone ? () => setModalZone(s.name) : undefined}
                  >
                    <div className="str-modal-item-top">
                      <span className="str-modal-name">{s.name}</span>
                      {s.count > 0 && <span className="str-modal-count">{s.count} systems</span>}
                    </div>
                    {s.sub && <span className="str-modal-sub">{s.sub}</span>}
                    {s.tech.length > 0 && (
                      <div className="str-modal-tech">
                        {s.tech.map(t => {
                          const icon = data.techIcons?.[t];
                          return icon
                            ? <img key={t} className="str-ring-tech-icon" src={icon} alt={t} title={t} />
                            : <span key={t} className="str-ring-tech-chip">{t}</span>;
                        })}
                      </div>
                    )}
                    {s.isZone && <span className="str-modal-explore">Click to explore →</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedSys && selectedNodeIdx >= 0 && positions[selectedNodeIdx] && (() => {
        const nx = positions[selectedNodeIdx].x;
        const ny = positions[selectedNodeIdx].y;
        const panelW = 260;
        const nodeAbsX = cx + nx;
        const nodeAbsY = cy + ny;
        const goLeft = nx >= 0 && nodeAbsX + 100 + panelW > dims.w - 20;
        const panelLeft = goLeft
          ? nodeAbsX - panelW - 20
          : nodeAbsX + (nx >= 0 ? 100 : -panelW - 20);
        const panelTop = Math.max(50, Math.min(dims.h - 280, nodeAbsY - 40));

        return (
          <div
            className="str-detail"
            style={{ left: Math.max(12, panelLeft), top: panelTop }}
          >
            <div className="str-detail-head">
              <span className="str-detail-name">{selectedSys.name}</span>
              <button className="str-detail-close" onClick={() => setSelectedId(null)}>×</button>
            </div>
            <div className="str-detail-chips">
              <span className="str-detail-chip">{selectedSys.type}</span>
              <span className="str-detail-chip">{selectedSys.systemTier}</span>
            </div>
            {selectedSys.description && (
              <p className="str-detail-desc">{selectedSys.description}</p>
            )}
            {whyItMatters && (
              <div className="str-detail-why">
                <span className="str-detail-why-label">Why it matters</span>
                <span className="str-detail-why-text">{whyItMatters}</span>
              </div>
            )}
            {usedWhen && (
              <div className="str-detail-when">
                <span className="str-detail-when-label">Used when</span>
                <span className="str-detail-when-text">{usedWhen}</span>
              </div>
            )}
            {flowPreview && (
              <div className="str-detail-flow">
                <span className="str-detail-flow-label">Flow</span>
                <span className="str-detail-flow-text">{flowPreview}</span>
              </div>
            )}
            {selectedSys.connections && (
              <div className="str-detail-conns">
                {(selectedSys.connections.outgoing || []).slice(0, 3).map(c => (
                  <div key={c.targetSystemName} className="str-detail-conn">
                    <span className="str-conn-arrow">→</span>
                    <span className="str-conn-name">{c.targetSystemName}</span>
                    <span className="str-conn-rel">{humanizeRelation(c.relation)}</span>
                  </div>
                ))}
                {(selectedSys.connections.incoming || []).slice(0, 2).map(c => (
                  <div key={c.targetSystemName} className="str-detail-conn">
                    <span className="str-conn-arrow">←</span>
                    <span className="str-conn-name">{c.targetSystemName}</span>
                    <span className="str-conn-rel">{humanizeRelation(c.relation)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Flow View ────────────────────────────────────────────────────────

function scoreFlow(f: { confidence: string; steps: unknown[]; isMain?: boolean; type: string }): number {
  let s = 0;
  if (f.isMain) s += 10;
  if (f.confidence === "high") s += 6;
  else if (f.confidence === "medium") s += 3;
  else s += 1;
  s += Math.min(f.steps.length, 5);
  if (f.type === "runtime") s += 2;
  else if (f.type === "build" || f.type === "rendering") s += 1;
  return s;
}

// ── Flow + Impact fusion layer ──────────────────────────────────────

type FusedStepImpact = {
  level: "high" | "medium" | "low" | "unknown";
  label: string;
  summary: string;
  reasons: string[];
  affectedSystems: Array<{ name: string; risk: string; zone?: string }>;
  consequences: string[];
  blastRadius: number;
  systemCount: number;
  zoneCount: number;
  whisper: string;
  semantic: string;
};

function inferSemantic(
  systemNames: string[],
  systemsByName: Map<string, AppData["analysis"]["systems"][0]>,
  stepIdx: number,
  totalSteps: number
): string {
  for (const n of systemNames) {
    const s = systemsByName.get(n);
    if (!s) continue;
    const role = s.systemRoleHint?.toLowerCase() || "";
    const name = s.name.toLowerCase();
    const type = s.type?.toLowerCase() || "";
    if (/auth|login|session|oauth/i.test(name)) return "Authentication gateway";
    if (/api|gateway|proxy|bff/i.test(name) || type === "api") return "API surface";
    if (/database|db|prisma|orm|data/i.test(name)) return "Data layer";
    if (/ui|dashboard|page|view|component/i.test(name) || type === "web-app") return "User-facing surface";
    if (/shared|common|lib|util/i.test(name) || type === "shared-package") return "Shared dependency";
    if (/config|env|setting/i.test(name)) return "Configuration layer";
    if (role.includes("core") || s.isRepoCenter) return "Core system";
  }
  if (stepIdx === 0) return "Entry point";
  if (stepIdx === totalSteps - 1) return "Final output";
  return "";
}

function toBehavioralConsequence(raw: string, systemName: string): string {
  const sn = systemName.replace(/-/g, " ");
  if (/imports?\s+from/i.test(raw)) {
    const what = /\((.*?)\)/.exec(raw)?.[1] || sn;
    return `${what} may break or behave unexpectedly`;
  }
  if (/consumes?\s/i.test(raw)) return `${sn} may receive stale or incorrect data`;
  if (/depends?\s+on/i.test(raw)) return `${sn} may fail or need updates`;
  if (/renders?|display/i.test(raw)) return `${sn} rendering may become inconsistent`;
  if (/route|endpoint|api/i.test(raw)) return `API requests through ${sn} may fail`;
  if (/auth|session|login/i.test(raw)) return `Authentication flow through ${sn} may break`;
  if (/config|env/i.test(raw)) return `Configuration consumed by ${sn} may become invalid`;
  if (/shared|common|util/i.test(raw)) return `Shared logic in ${sn} may cause regressions`;
  if (/build|compile|bundle/i.test(raw)) return `Build output for ${sn} may fail`;
  if (raw.length > 60) return `${sn} may need updates`;
  return raw;
}

function resolveStepImpact(
  systemNames: string[],
  systemsByName: Map<string, AppData["analysis"]["systems"][0]>,
  impactResults: Record<string, ChangeImpactResult> | undefined,
  stepIdx: number,
  totalSteps: number,
  zones: Array<{ name: string; systemNames?: string[] }>
): FusedStepImpact {
  const empty: FusedStepImpact = { level: "unknown", label: "Limited signal", summary: "", reasons: [], affectedSystems: [], consequences: [], blastRadius: 0, systemCount: 0, zoneCount: 0, whisper: "", semantic: "" };

  const sem = inferSemantic(systemNames, systemsByName, stepIdx, totalSteps);
  if (!impactResults || systemNames.length === 0) return { ...empty, semantic: sem, whisper: sem || "Limited impact signal" };

  let bestResult: ChangeImpactResult | null = null;
  let bestScore = -1;

  for (const name of systemNames) {
    const sys = systemsByName.get(name);
    if (!sys) continue;
    const ir = impactResults[sys.id] || impactResults[name];
    if (ir && ir.blastRadiusScore > bestScore) {
      bestResult = ir;
      bestScore = ir.blastRadiusScore;
    }
  }

  if (!bestResult) return { ...empty, semantic: sem, whisper: sem || "Limited impact signal" };

  const level: FusedStepImpact["level"] =
    bestResult.blastRadiusLevel === "architectural" || bestResult.blastRadiusLevel === "broad" ? "high" :
    bestResult.blastRadiusLevel === "contained" ? "medium" : "low";

  const label =
    level === "high" ? "High impact" :
    level === "medium" ? "Medium impact" : "Low impact";

  const allImpacts = [...bestResult.directImpacts, ...bestResult.indirectImpacts];
  const affected = allImpacts.slice(0, 5).map(imp => {
    const z = zones.find(zone => zone.systemNames?.includes(imp.systemName));
    return { name: imp.systemName, risk: imp.risk, zone: z?.name };
  });

  const zoneSet = new Set(affected.map(a => a.zone).filter(Boolean));
  const sysCount = allImpacts.length;
  const zoneCount = zoneSet.size;

  const reasons: string[] = [];
  if (bestResult.directImpacts.length > 0) reasons.push(`${bestResult.directImpacts.length} system${bestResult.directImpacts.length > 1 ? "s" : ""} directly depend on this`);
  if (bestResult.indirectImpacts.length > 0) reasons.push(`${bestResult.indirectImpacts.length} more affected indirectly`);

  const consequences: string[] = [];
  for (const d of bestResult.directImpacts.slice(0, 4)) {
    if (d.reason) {
      const raw = d.reason.split("—")[0].trim();
      const behavioral = toBehavioralConsequence(raw, d.systemName);
      consequences.push(behavioral);
    }
  }

  const numericPart = sysCount > 0 && zoneCount > 1
    ? `affects ${sysCount} system${sysCount > 1 ? "s" : ""} across ${zoneCount} zone${zoneCount > 1 ? "s" : ""}`
    : sysCount > 0
    ? `used by ${sysCount} system${sysCount > 1 ? "s" : ""}`
    : "";

  let whisper = "";
  if (sem && numericPart) whisper = `${sem} — ${numericPart}`;
  else if (sem) whisper = sem;
  else if (numericPart) whisper = numericPart.charAt(0).toUpperCase() + numericPart.slice(1);
  else whisper = label;

  return { level, label, summary: bestResult.summary, reasons, affectedSystems: affected, consequences, blastRadius: bestResult.blastRadiusScore, systemCount: sysCount, zoneCount, whisper, semantic: sem };
}

function shortenImportance(text: string): string {
  let s = text.replace(/\.$/, "").trim();
  s = s.replace(/^This is the /, "").replace(/^This /, "");
  if (s.length > 80) {
    const dash = s.indexOf("—");
    if (dash > 20 && dash < 70) s = s.slice(0, dash).trim();
    else s = s.split(/[.;]/, 1)[0].trim();
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function FlowView({ data, onBack }: { data: AppData; onBack: () => void }) {
  const rawFlows = useMemo(() => {
    const f = data.repoStory?.flows || [];
    return [...f].sort((a, b) => scoreFlow(b) - scoreFlow(a));
  }, [data.repoStory?.flows]);

  const [activeFlowIdx, setActiveFlowIdx] = useState(0);
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [entered, setEntered] = useState(false);

  const activeFlow = rawFlows[activeFlowIdx] || null;
  const steps = activeFlow?.steps || [];
  const activeStep = steps[activeStepIdx] || null;

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setEntered(false);
    setActiveStepIdx(0);
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, [activeFlowIdx]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  const handleStepClick = useCallback((i: number) => {
    setActiveStepIdx(i);
  }, []);

  const systemsByName = useMemo(() => {
    const map = new Map<string, typeof data.analysis.systems[0]>();
    for (const s of data.analysis.systems) map.set(s.name, s);
    return map;
  }, [data.analysis.systems]);

  const getSystemsForStep = useCallback((step: typeof steps[0]): string[] => {
    if (!step) return [];
    const names = new Set<string>();
    if (step.systemName) names.add(step.systemName);
    if (step.zoneName) {
      const zone = data.repoStory?.zones?.find(z => z.name === step.zoneName);
      if (zone?.systemNames) zone.systemNames.slice(0, 4).forEach(n => names.add(n));
    }
    return Array.from(names);
  }, [data.repoStory?.zones]);

  const getFilesForStep = useCallback((step: typeof steps[0]): string[] => {
    if (!step) return [];
    const sysNames = getSystemsForStep(step);
    const paths: string[] = [];
    for (const name of sysNames) {
      const sys = systemsByName.get(name);
      if (sys?.entryPoints?.length) {
        for (const ep of sys.entryPoints.slice(0, 2)) {
          if (!paths.includes(ep.path)) paths.push(ep.path);
        }
      }
      if (paths.length >= 2) break;
    }
    return paths.slice(0, 2);
  }, [systemsByName, getSystemsForStep]);

  const ctxSystems = useMemo(() => getSystemsForStep(activeStep!), [activeStep, getSystemsForStep]);
  const ctxFiles = useMemo(() => getFilesForStep(activeStep!), [activeStep, getFilesForStep]);

  const zones = data.repoStory?.zones || [];
  const stepImpacts = useMemo(() => {
    return steps.map((step, i) => {
      const sysNames = getSystemsForStep(step);
      return resolveStepImpact(sysNames, systemsByName, data.impactResults, i, steps.length, zones);
    });
  }, [steps, getSystemsForStep, systemsByName, data.impactResults, zones]);

  const activeImpact = stepImpacts[activeStepIdx] || null;

  const highImpactCount = useMemo(() => stepImpacts.filter(si => si.level === "high").length, [stepImpacts]);

  const [showCriticalOnly, setShowCriticalOnly] = useState(false);

  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const copyPath = useCallback((filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const done = () => { setCopiedFile(filePath); setTimeout(() => setCopiedFile(null), 1500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(filePath).then(done).catch(done);
    } else {
      const ta = document.createElement("textarea");
      ta.value = filePath;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      done();
    }
  }, []);

  if (rawFlows.length === 0) {
    return (
      <div className="fv-screen">
        <button className="fv-back" onClick={onBack}>← Back</button>
        <div className="fv-empty">
          <span className="fv-empty-title">No flows detected</span>
          <span className="fv-empty-sub">This codebase doesn't match any known architectural flow patterns yet.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fv-screen">
      <div className="fv-body">
        <div className="fv-flows-col">
          <span className="fv-flows-label">Flows</span>
          {rawFlows.map((f, i) => (
            <button
              key={f.id}
              className={`fv-flow-tab${i === activeFlowIdx ? " fv-flow-tab-active" : ""}`}
              onClick={() => setActiveFlowIdx(i)}
            >
              <span className="fv-flow-tab-title">{f.title}</span>
              <span className="fv-flow-tab-type">{f.type}</span>
            </button>
          ))}
        </div>
        <div className="fv-timeline-col">
          {steps.map((step, i) => {
            const isActive = i === activeStepIdx;
            const isLast = i === steps.length - 1;
            const isPast = i < activeStepIdx;
            const isFirst = i === 0;
            const stepSystems = getSystemsForStep(step);
            const stepFiles = getFilesForStep(step);
            const impact = stepImpacts[i];
            const dimmed = showCriticalOnly && impact.level !== "high";
            return (
              <React.Fragment key={i}>
                <div
                  className={`fv-step${entered ? " fv-step-in" : ""}${isActive ? " fv-step-active" : ""}${isPast ? " fv-step-past" : ""}${isFirst ? " fv-step-first" : ""}${dimmed ? " fv-step-dimmed" : ""}`}
                  style={{ animationDelay: entered ? `${120 + i * 100}ms` : "0ms" }}
                  onClick={() => handleStepClick(i)}
                >
                  <div className="fv-step-body">
                    <div className="fv-step-header-row">
                      <span className="fv-step-title">{step.label}</span>
                      {impact.level !== "unknown" && (
                        <span className={`fv-impact-badge fv-impact-${impact.level}`}>{impact.label}</span>
                      )}
                    </div>
                    {step.description && (
                      <span className="fv-step-desc">{step.description}</span>
                    )}
                    {stepSystems.length > 0 && (
                      <div className="fv-step-systems">
                        {stepSystems.map(s => (
                          <span key={s} className="fv-step-sys">{s}</span>
                        ))}
                      </div>
                    )}
                    {impact.whisper && (
                      <span className={`fv-step-whisper fv-step-whisper-${impact.level}`}>⚡ {impact.whisper}</span>
                    )}
                    {stepFiles.length > 0 && (
                      <div className="fv-step-files">
                        {stepFiles.map(f => (
                          <span key={f} className="fv-step-file">
                            <span className="fv-file-path">{f}</span>
                            <span className="fv-file-copy" onClick={(e) => copyPath(f, e)} title="Copy path">
                              {copiedFile === f ? "Copied!" : "⧉"}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {!isLast && (
                  <div className={`fv-connector${isPast ? " fv-connector-past" : ""}`}>
                    <span className="fv-connector-arrow">↓</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="fv-context-col">
          {activeStep && activeImpact && (
            <div className={`fv-ctx fv-ctx-accent-${activeImpact.level}`} key={activeStepIdx}>

              <h3 className="fv-ctx-title">{activeStep.label}</h3>

              {activeImpact.semantic && (
                <span className="fv-ctx-semantic">{activeImpact.semantic}</span>
              )}

              {(activeStep.whyItMatters || activeImpact.summary) && (
                <p className="fv-ctx-importance">{shortenImportance(activeStep.whyItMatters || activeImpact.summary)}</p>
              )}

              {activeImpact.level !== "unknown" && (activeImpact.systemCount > 0 || activeImpact.zoneCount > 0) && (
                <div className="fv-ctx-reach">
                  ⚡ {activeImpact.whisper}
                </div>
              )}

              {activeImpact.consequences.length > 0 && (
                <>
                  <div className="fv-ctx-label">If you change this</div>
                  <ul className="fv-ctx-impact-list">
                    {activeImpact.consequences.map((c, ci) => <li key={ci}>{c}</li>)}
                  </ul>
                </>
              )}

              {activeImpact.affectedSystems.length > 0 && (
                <>
                  <div className="fv-ctx-label">Blast radius</div>
                  <div className="fv-ctx-impact-systems">
                    {activeImpact.affectedSystems.map((a, ai) => (
                      <span key={ai} className={`fv-ctx-impact-sys fv-ctx-impact-sys-${a.risk}`}>{a.name}</span>
                    ))}
                  </div>
                </>
              )}

              {ctxSystems.length > 0 && (
                <>
                  <div className="fv-ctx-label">Systems involved</div>
                  <div className="fv-ctx-chips">
                    {ctxSystems.map(s => (
                      <span key={s} className="fv-ctx-chip">{s}</span>
                    ))}
                  </div>
                </>
              )}

              {ctxFiles.length > 0 && (
                <>
                  <div className="fv-ctx-label">Key files</div>
                  <div className="fv-ctx-files">
                    {ctxFiles.map(f => (
                      <span key={f} className="fv-ctx-file">
                        <span className="fv-file-path">{f}</span>
                        <span className="fv-file-copy" onClick={(e) => copyPath(f, e)} title="Copy path">
                          {copiedFile === f ? "Copied!" : "⧉"}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              {activeImpact.reasons.length > 0 && (
                <>
                  <div className="fv-ctx-label">Why this matters technically</div>
                  <ul className="fv-ctx-impact-list">
                    {activeImpact.reasons.map((r, ri) => <li key={ri}>{r}</li>)}
                  </ul>
                </>
              )}

              {activeImpact.level === "unknown" && (
                <p className="fv-ctx-text fv-ctx-text-muted">Memor could not confidently estimate blast radius for this step. Try the Impact view for connected systems.</p>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Impact View ──────────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = { high: "HIGH", medium: "MED", low: "LOW" };
const BLAST_META: Record<string, { label: string; cls: string }> = {
  architectural: { label: "HIGH IMPACT", cls: "iv-blast-high" },
  broad: { label: "HIGH IMPACT", cls: "iv-blast-high" },
  contained: { label: "MEDIUM IMPACT", cls: "iv-blast-med" },
  local: { label: "LOW IMPACT", cls: "iv-blast-low" },
};
const IMPACT_TYPE_LABELS: Record<string, string> = {
  runtime: "Runtime", build: "Build", api: "API", integration: "Integration", tooling: "Tooling",
};

function getBreakRisk(impactType: string, risk: string, sourceName: string, targetName: string): string {
  const type = impactType || "runtime";
  if (type === "runtime") {
    if (risk === "high") return `${targetName} directly depends on ${sourceName} at runtime — features using ${targetName} may break or produce incorrect output.`;
    if (risk === "medium") return `Some runtime paths through ${targetName} may behave differently. Secondary features are most at risk.`;
    return `Minor runtime change — ${targetName} is unlikely to break, but worth a quick verification.`;
  }
  if (type === "build") {
    if (risk === "high") return `Build pipeline for ${targetName} may fail — expect compilation errors or bundling issues.`;
    return `Build configuration for ${targetName} may need minor adjustment.`;
  }
  if (type === "api") {
    if (risk === "high") return `${targetName} consumes ${sourceName}'s API contract — breaking changes will likely require ${targetName} updates.`;
    return `${targetName} may need compatibility check if ${sourceName}'s API surface shifts.`;
  }
  if (type === "integration") {
    if (risk === "high") return `${targetName} integrates directly with ${sourceName} — adapters or connectors may need updates.`;
    return `Integration between ${targetName} and ${sourceName} may need verification.`;
  }
  if (type === "tooling") return `Dev tooling in ${targetName} may need updates — tests or scripts referencing ${sourceName} could fail.`;
  return `${targetName} may need verification after changes to ${sourceName}.`;
}

function getRecommendation(risk: string, tier: string, impactType: string, sourceName: string, targetName: string): string {
  if (risk === "high" && tier === "direct") return `Write tests covering ${targetName}'s usage of ${sourceName} before modifying. Consider a feature flag for gradual rollout.`;
  if (risk === "high" && tier === "indirect") return `Indirect but high-risk. Verify the intermediate system between ${sourceName} and ${targetName} still works. Add integration tests for the full path.`;
  if (risk === "medium") return `Review the connection points between ${sourceName} and ${targetName}. Run existing tests and manually verify affected areas.`;
  return `Low risk. Standard testing should cover ${targetName}. Keep an eye on CI results.`;
}

function getBlastExplanation(level: string, count: number, name: string): string {
  if (level === "architectural" || level === "broad")
    return `Changing ${name} is high-stakes — it touches ${count} systems across multiple zones. Plan carefully, test broadly, and consider incremental rollout.`;
  if (level === "contained")
    return `${name} has moderate reach — ${count} systems are affected. Targeted testing of connected modules should catch issues.`;
  return `${name} is relatively isolated — ${count > 0 ? `${count} system${count !== 1 ? "s" : ""} affected` : "limited blast radius"}. Standard testing applies.`;
}

function fallbackCopy(text: string) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(ta);
}

function ImpactView({ data, onBack }: { data: AppData; onBack: () => void }) {
  const impactResults = data.impactResults || {};
  const systems = data.analysis.systems;

  const selectableSystems = useMemo(() => {
    const preferred = systems.filter(s => s.systemTier === "primary" || s.systemTier === "secondary");
    const pool = preferred.length > 0 ? preferred : systems;
    return pool
      .filter(s => impactResults[s.id])
      .sort((a, b) => {
        const sa = impactResults[a.id]?.blastRadiusScore ?? 0;
        const sb = impactResults[b.id]?.blastRadiusScore ?? 0;
        return sb - sa;
      })
      .slice(0, 12);
  }, [systems, impactResults]);

  const defaultId = useMemo(() => {
    const center = systems.find(s => s.isRepoCenter);
    if (center && impactResults[center.id]) return center.id;
    if (selectableSystems.length > 0) return selectableSystems[0].id;
    const anyWithImpact = systems.find(s => impactResults[s.id]);
    return anyWithImpact?.id || systems[0]?.id || "";
  }, [systems, impactResults, selectableSystems]);

  const [selectedId, setSelectedId] = useState(defaultId);
  const [clickedNodeId, setClickedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const ivCopyPath = useCallback((filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const done = () => { setCopiedFile(filePath); setTimeout(() => setCopiedFile(null), 1500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(filePath).then(done).catch(() => {
        fallbackCopy(filePath); done();
      });
    } else {
      fallbackCopy(filePath); done();
    }
  }, []);

  const graphRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const t1Refs = useRef<Map<string, HTMLDivElement>>(new Map());
  const t2Refs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [edges, setEdges] = useState<{ x1: number; y1: number; x2: number; y2: number; id: string; tier: string }[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setClickedNodeId(null);
    setHoveredNodeId(null);
    setEntered(false);
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, [selectedId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  const result = impactResults[selectedId] || null;
  const selectedSys = systems.find(s => s.id === selectedId);

  const topDirect = useMemo(() => {
    if (!result) return [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...result.directImpacts].sort((a, b) => order[a.risk] - order[b.risk]).slice(0, 4);
  }, [result]);

  const topIndirect = useMemo(() => {
    if (!result) return [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...result.indirectImpacts].sort((a, b) => order[a.risk] - order[b.risk]).slice(0, 3);
  }, [result]);

  const totalImpacted = (result?.directImpacts.length || 0) + (result?.indirectImpacts.length || 0);
  const blastMeta = BLAST_META[result?.blastRadiusLevel || "local"] || BLAST_META.local;

  const impactCategories = useMemo(() => {
    if (!result) return [];
    const counts: Record<string, number> = {};
    for (const d of result.directImpacts) counts[d.impactType] = (counts[d.impactType] || 0) + 1;
    for (const i of result.indirectImpacts) counts[i.impactType] = (counts[i.impactType] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({
      type, label: IMPACT_TYPE_LABELS[type] || type, count,
    }));
  }, [result]);

  const detailEntry = useMemo(() => {
    if (!clickedNodeId) return null;
    const direct = result?.directImpacts.find(d => d.systemId === clickedNodeId);
    if (direct) return { ...direct, tier: "direct" as const };
    const indirect = result?.indirectImpacts.find(d => d.systemId === clickedNodeId);
    if (indirect) return { ...indirect, tier: "indirect" as const };
    return null;
  }, [clickedNodeId, result]);

  const detailSys = clickedNodeId ? systems.find(s => s.id === clickedNodeId) : null;
  const detailFiles = useMemo(() => {
    if (!detailSys?.entryPoints?.length) return [];
    return detailSys.entryPoints.slice(0, 2).map(ep => ep.path).filter(Boolean);
  }, [detailSys]);

  const sourceFiles = useMemo(() => {
    if (!selectedSys?.entryPoints?.length) return [];
    return selectedSys.entryPoints.slice(0, 2).map(ep => ep.path).filter(Boolean);
  }, [selectedSys]);

  const highRiskCount = useMemo(() => {
    if (!result) return 0;
    return [...result.directImpacts, ...result.indirectImpacts].filter(d => d.risk === "high").length;
  }, [result]);

  useEffect(() => {
    if (!entered || !graphRef.current || !sourceRef.current) return;
    const timer = setTimeout(() => {
      const gRect = graphRef.current!.getBoundingClientRect();
      const sRect = sourceRef.current!.getBoundingClientRect();
      const sx = sRect.left + sRect.width / 2 - gRect.left;
      const sy = sRect.top + sRect.height / 2 - gRect.top;
      const newEdges: typeof edges = [];

      t1Refs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        newEdges.push({
          x1: sx, y1: sy,
          x2: r.left - gRect.left, y2: r.top + r.height / 2 - gRect.top,
          id, tier: "direct",
        });
      });

      t2Refs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        const ind = topIndirect.find(t => t.systemId === id);
        const viaName = ind?.via?.[0];
        let fromX = sx, fromY = sy;
        if (viaName) {
          const viaDirect = topDirect.find(d => d.systemName === viaName);
          if (viaDirect) {
            const viaEl = t1Refs.current.get(viaDirect.systemId);
            if (viaEl) {
              const vr = viaEl.getBoundingClientRect();
              fromX = vr.left + vr.width - gRect.left;
              fromY = vr.top + vr.height / 2 - gRect.top;
            }
          }
        }
        newEdges.push({
          x1: fromX, y1: fromY,
          x2: r.left - gRect.left, y2: r.top + r.height / 2 - gRect.top,
          id, tier: "indirect",
        });
      });

      setEdges(newEdges);
    }, 500);
    return () => clearTimeout(timer);
  }, [entered, topDirect, topIndirect, selectedId]);

  if (Object.keys(impactResults).length === 0) {
    return (
      <div className="iv-screen">
        <div className="iv-body">
          <div className="iv-systems-col">
            <button className="iv-back" onClick={onBack}>← Back</button>
          </div>
          <div className="iv-graph-col">
            <div className="fv-empty">
              <span className="fv-empty-title">No impact data available</span>
              <span className="fv-empty-sub">This codebase doesn't have enough connections to compute impact analysis.</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="iv-screen">
      <div className="iv-body">
        <div className="iv-systems-col">
          <span className="iv-systems-label">Systems</span>
          {selectableSystems.map(s => {
            const ir = impactResults[s.id];
            const isActive = s.id === selectedId;
            return (
              <button
                key={s.id}
                className={`iv-sys-tab${isActive ? " iv-sys-tab-active" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <span className="iv-sys-tab-name">{s.name}</span>
                {ir && (
                  <span className={`iv-sys-tab-level iv-sys-tab-${ir.blastRadiusLevel === "architectural" || ir.blastRadiusLevel === "broad" ? "high" : ir.blastRadiusLevel === "contained" ? "med" : "low"}`}>
                    {ir.blastRadiusLevel === "architectural" || ir.blastRadiusLevel === "broad" ? "HIGH" : ir.blastRadiusLevel === "contained" ? "MED" : "LOW"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="iv-graph-col">
          {topDirect.length === 0 ? (
            <div className="iv-graph-empty-wrap">
              <div className="iv-source-dot" style={{ marginBottom: 12 }} />
              <span className="iv-graph-empty-title">{selectedSys?.name || "—"}</span>
              <span className="iv-graph-empty">Changes to this system have no detected downstream impact</span>
            </div>
          ) : (
            <div className={`iv-graph${entered ? " iv-graph-in" : ""}`} ref={graphRef}>
              <svg className="iv-edges">
                <defs>
                  <marker id="iv-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                  </marker>
                  <marker id="iv-arrow-hl" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6" fill="none" stroke="#6366f1" strokeWidth="1" />
                  </marker>
                </defs>
                {edges.map(e => {
                  const isHl = hoveredNodeId === e.id || clickedNodeId === e.id;
                  return (
                    <line key={e.id}
                      className={`iv-edge${e.tier === "indirect" ? " iv-edge-ind" : ""}${isHl ? " iv-edge-hl" : ""}`}
                      x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
                      markerEnd={isHl ? "url(#iv-arrow-hl)" : "url(#iv-arrow)"}
                    />
                  );
                })}
              </svg>

              <div className="iv-tier iv-tier-source">
                <div className="iv-source-dot" ref={sourceRef} />
                <span className="iv-source-label">{selectedSys?.name}</span>
              </div>

              <div className="iv-tier iv-tier-1">
                {topDirect.map((d, i) => (
                  <div
                    key={d.systemId}
                    ref={el => { if (el) t1Refs.current.set(d.systemId, el); else t1Refs.current.delete(d.systemId); }}
                    className={`iv-node iv-node-${d.risk}${clickedNodeId === d.systemId ? " iv-node-selected" : ""}${entered ? " iv-node-in" : ""}`}
                    style={{ animationDelay: `${150 + i * 80}ms` }}
                    onMouseEnter={() => setHoveredNodeId(d.systemId)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={() => setClickedNodeId(clickedNodeId === d.systemId ? null : d.systemId)}
                  >
                    <span className="iv-node-name">{d.systemName}</span>
                    <span className={`iv-node-risk iv-risk-${d.risk}`}>{RISK_LABELS[d.risk]}</span>
                  </div>
                ))}
              </div>

              {topIndirect.length > 0 && (
                <div className="iv-tier iv-tier-2">
                  {topIndirect.map((ind, i) => (
                    <div
                      key={ind.systemId}
                      ref={el => { if (el) t2Refs.current.set(ind.systemId, el); else t2Refs.current.delete(ind.systemId); }}
                      className={`iv-node iv-node-${ind.risk}${clickedNodeId === ind.systemId ? " iv-node-selected" : ""}${entered ? " iv-node-in" : ""}`}
                      style={{ animationDelay: `${350 + i * 80}ms` }}
                      onMouseEnter={() => setHoveredNodeId(ind.systemId)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      onClick={() => setClickedNodeId(clickedNodeId === ind.systemId ? null : ind.systemId)}
                    >
                      <span className="iv-node-name">{ind.systemName}</span>
                      <span className={`iv-node-risk iv-risk-${ind.risk}`}>{RISK_LABELS[ind.risk]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="iv-detail-col">
          {detailEntry && detailSys ? (
            <div className="iv-detail" key={clickedNodeId}>
              <h3 className="iv-detail-title">{detailSys.name}</h3>

              <div className="iv-detail-label">Why it matters</div>
              <p className="iv-detail-text">{detailEntry.reason}</p>

              <div className="iv-detail-label">What could break</div>
              <p className="iv-detail-text iv-detail-break">{getBreakRisk(detailEntry.impactType, detailEntry.risk, selectedSys?.name || "", detailSys.name)}</p>

              <div className="iv-detail-row">
                <div>
                  <div className="iv-detail-label">Impact type</div>
                  <span className={`iv-detail-type-chip iv-cat-${detailEntry.impactType}`}>
                    {IMPACT_TYPE_LABELS[detailEntry.impactType] || detailEntry.impactType}
                  </span>
                </div>
                <div>
                  <div className="iv-detail-label">Risk level</div>
                  <span className={`iv-detail-risk iv-risk-${detailEntry.risk}`}>
                    {RISK_LABELS[detailEntry.risk]}
                  </span>
                </div>
              </div>

              <div className="iv-detail-label">Recommendation</div>
              <p className="iv-detail-text iv-detail-rec">{getRecommendation(detailEntry.risk, detailEntry.tier, detailEntry.impactType, selectedSys?.name || "", detailSys.name)}</p>

              <div className="iv-detail-label">Impact path</div>
              <div className="iv-detail-path">
                <span className="iv-path-chip">{selectedSys?.name}</span>
                <span className="iv-path-arrow">→</span>
                {detailEntry.tier === "indirect" && detailEntry.via?.map(v => (
                  <React.Fragment key={v}>
                    <span className="iv-path-chip">{v}</span>
                    <span className="iv-path-arrow">→</span>
                  </React.Fragment>
                ))}
                <span className="iv-path-chip iv-path-current">{detailSys.name}</span>
              </div>

              {detailEntry.zoneName && (
                <>
                  <div className="iv-detail-label">Zone</div>
                  <span className="iv-detail-zone">{detailEntry.zoneName}</span>
                </>
              )}

              {detailFiles.length > 0 && (
                <>
                  <div className="iv-detail-label">Key files</div>
                  <div className="iv-detail-files">
                    {detailFiles.map(f => (
                      <span key={f} className="iv-detail-file">
                        <span className="iv-file-path">{f}</span>
                        <span className="iv-file-copy" onClick={(e) => ivCopyPath(f, e)} title="Copy path">
                          {copiedFile === f ? "Copied!" : "⧉"}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : selectedSys && result ? (
            <div className="iv-detail iv-detail-default">
              <h3 className="iv-detail-title">{selectedSys.name}</h3>
              <span className="iv-detail-sys-type">{selectedSys.type?.replace(/-/g, " ")}</span>
              {selectedSys.description && (
                <p className="iv-detail-desc">{selectedSys.description.split(".")[0]}.</p>
              )}

              <div className="iv-detail-meta-row">
                <span className={`iv-detail-impact-level ${blastMeta.cls}`}>{blastMeta.label}</span>
                <span className="iv-detail-meta-count">Touches {totalImpacted} system{totalImpacted !== 1 ? "s" : ""}{highRiskCount > 0 ? ` · ${highRiskCount} high-risk` : ""}</span>
              </div>

              {impactCategories.length > 0 && (
                <div className="iv-detail-cats">
                  {impactCategories.map(c => (
                    <span key={c.type} className={`iv-cat-tag iv-cat-${c.type}`}>
                      {c.label} {c.count}
                    </span>
                  ))}
                </div>
              )}

              <p className="iv-detail-text">{result.summary}</p>

              <div className="iv-detail-label">Blast radius</div>
              <div className="iv-detail-blast-bar">
                <div className="iv-detail-blast-fill" style={{ width: `${result.blastRadiusScore}%` }} />
              </div>
              <span className="iv-detail-blast-score">{result.blastRadiusScore}/100 — {result.blastRadiusLevel}</span>

              <div className="iv-detail-label" style={{ marginTop: 14 }}>What this means</div>
              <p className="iv-detail-text">{getBlastExplanation(result.blastRadiusLevel, totalImpacted, selectedSys.name)}</p>

              {sourceFiles.length > 0 && (
                <>
                  <div className="iv-detail-label" style={{ marginTop: 10 }}>Key files</div>
                  <div className="iv-detail-files">
                    {sourceFiles.map(f => (
                      <span key={f} className="iv-detail-file">
                        <span className="iv-file-path">{f}</span>
                        <span className="iv-file-copy" onClick={(e) => ivCopyPath(f, e)} title="Copy path">
                          {copiedFile === f ? "Copied!" : "⧉"}
                        </span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              <div className="iv-detail-hint" style={{ marginTop: 16 }}>Click a node in the graph to see details</div>
            </div>
          ) : (
            <div className="iv-detail iv-detail-default">
              <h3 className="iv-detail-title">Select a system</h3>
              <p className="iv-detail-text">Choose a system from the left to inspect its impact.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dock & Canvas ────────────────────────────────────────────────────

function DockToolbar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <nav className="dock">
      {DOCK_ITEMS.map((item, i) => (
        <React.Fragment key={item.id}>
          {i > 0 && <div className="dock-sep" />}
          <button
            className={`dock-item${active === item.id ? " dock-active" : ""}`}
            onClick={() => onSelect(item.id)}
            title={item.label}
          >
            <span className="dock-icon" style={{ color: item.color }} dangerouslySetInnerHTML={{ __html: item.svg }} />
            <span className="dock-label">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

function CanvasBackground() {
  return <div className="dotgrid" />;
}

// ── Root App ─────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default function App({ data }: { data: AppData }) {
  const [activeItem, setActiveItem] = useState("overview");
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("memor-theme");
    return stored === "light" ? "light" : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("memor-theme", next);
  }, [theme]);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div id="app" className={loaded ? "app-loaded" : ""}>
      <header className="topbar">
        <span className="topbar-brand">Memor</span>
        <button className="topbar-theme-toggle" onClick={toggleTheme} title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
      </header>

      <div className="desktop">
        <CanvasBackground />

        {activeItem === "overview" && (
          <CenterSeedCard data={data} />
        )}

        {activeItem === "structure" && (
          <StructureView data={data} onBack={() => setActiveItem("overview")} />
        )}

        {activeItem === "flow" && (
          <FlowView data={data} onBack={() => setActiveItem("overview")} />
        )}

        {activeItem === "impact" && (
          <ImpactView data={data} onBack={() => setActiveItem("overview")} />
        )}

        <DockToolbar active={activeItem} onSelect={setActiveItem} />
      </div>
    </div>
  );
}
