#!/usr/bin/env node
import * as path from "path";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import { exec } from "child_process";
import { analyzeRepo } from "./builders/analyzeRepo";
import { generateRepoStory } from "./builders/generateRepoStory";
import { generateRepoFlows } from "./builders/generateRepoFlows";
import { applyNarratives } from "./builders/generateSystemNarrative";
import { generateReadingOrder } from "./builders/generateReadingOrder";
import { detectCouplings } from "./builders/detectCouplings";
import { analyzeChangeImpact } from "./builders/analyzeChangeImpact";
import type { ChangeImpactResult } from "./builders/analyzeChangeImpact";
import { buildImportGraphStats } from "./scanner/buildImportGraph";
import type { ImportGraphStats } from "./scanner/buildImportGraph";
import { generateAhaSummary } from "./builders/generateAhaSummary";
import { assessAnalysisQuality } from "./builders/assessAnalysisQuality";
import type { AnalysisQuality } from "./builders/assessAnalysisQuality";
import { buildDemoScript } from "./demo/demoScript";
import { buildConnectionGraphView } from "./viewBuilders/buildConnectionGraphView";
import { buildSystemFocusView } from "./viewBuilders/buildSystemFocusView";
import { buildInternalArchView } from "./viewBuilders/buildInternalArchView";
import { buildAppPage } from "./app/buildAppPage";
import type { AppData } from "./app/buildAppPage";
import { startAppServer } from "./server";
import { pathExists } from "./utils/file";
import { slugify } from "./utils/text";
import type { SystemFocusView, InternalArchitectureView } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} ${url}`);
}

function showHelp(): void {
  console.log(`
  Memor — Architecture understanding for codebases

  Usage:
    memor [path]              Analyze and open explorer
    memor analyze [path]      Same as above

  MCP Server:
    memor-mcp [path]          Start as MCP server (stdio transport)

  Options:
    --open                    Auto-open browser
    --port <number>           Server port (default: 4173)
    --export                  Also generate HTML/Markdown report files
    --output <dir>            Output directory for JSON + exports
    --help, -h                Show this help

  MCP Integration:
    Add to your editor's MCP config:
    {
      "memor": {
        "command": "memor-mcp",
        "args": ["/path/to/your/project"]
      }
    }
`);
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // Flags
  let autoOpen = false;
  let port = 4173;
  let doExport = false;
  let outputDir = "";
  const positional: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--open") {
      autoOpen = true;
    } else if (a === "--export") {
      doExport = true;
    } else if (a === "--port" && rawArgs[i + 1]) {
      port = parseInt(rawArgs[i + 1], 10);
      i++;
    } else if (a === "--output" && rawArgs[i + 1]) {
      outputDir = rawArgs[i + 1];
      i++;
    } else if (a === "--help" || a === "-h") {
      showHelp();
      process.exit(0);
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }

  // Strip "analyze" subcommand if present
  if (positional[0] === "analyze") positional.shift();

  // Resolve repo path (default = cwd)
  const rawPath = positional.join(" ").trim() || ".";
  let repoPath = path.resolve(process.cwd(), rawPath);

  if (!(await pathExists(repoPath))) {
    console.error(`  Error: path does not exist: ${repoPath}`);
    process.exit(1);
  }
  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(`  Error: not a directory: ${repoPath}`);
    process.exit(1);
  }

  // ── Analyze ──────────────────────────────────

  console.log("");
  console.log("  \x1b[1mMemor\x1b[0m");
  console.log("");
  console.log(`  Analyzing: ${repoPath}`);

  let result: Awaited<ReturnType<typeof analyzeRepo>>;
  try {
    result = await analyzeRepo(repoPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\n  Error: ${msg}`);
    process.exit(1);
  }

  const { analysis, deprioritizedPaths, scanMeta } = result;
  const repoSlug = slugify(analysis.repoName) || "repo";

  // ── Build views ──────────────────────────────

  const connectionGraph = buildConnectionGraphView(analysis);

  const focusViews: Record<string, SystemFocusView> = {};
  for (const sys of analysis.systems) {
    const fv = buildSystemFocusView(analysis, sys.id);
    if (fv) focusViews[sys.id] = fv;
  }

  const internalViews: Record<string, InternalArchitectureView> = {};
  for (const sys of analysis.systems) {
    if (!sys.internalStructure || sys.internalStructure.zones.length < 2) continue;
    const iv = buildInternalArchView(sys);
    if (iv) internalViews[sys.id] = iv;
  }

  // ── Apply narratives ─────────────────────────

  applyNarratives(analysis.systems, analysis.repoName);

  // ── Build repo story ─────────────────────────

  const repoStory = generateRepoStory(analysis);

  // ── Build flows ─────────────────────────────

  const flows = generateRepoFlows(analysis, repoStory);
  repoStory.flows = flows.slice(0, 4).map((f) => ({
    id: f.id,
    title: f.title,
    type: f.type,
    confidence: f.confidence,
    isMain: f.isMain,
    derivedFrom: f.derivedFrom,
    structuralReason: f.structuralReason,
    steps: f.steps.map((s) => ({
      label: s.label,
      description: s.description,
      systemName: s.systemName,
      zoneName: s.zoneName,
      evidenceFile: s.evidenceFile,
      evidenceLine: s.evidenceLine,
      handlerName: s.handlerName,
    })),
  }));

  // ── Build reading order ─────────────────────

  const readingOrder = generateReadingOrder(analysis, repoStory);
  repoStory.readingOrder = readingOrder.steps;

  // ── Detect couplings ────────────────────────

  const couplings = detectCouplings(analysis, repoStory);
  repoStory.keyCouplings = couplings.slice(0, 8).map((c) => ({
    from: c.sourceName,
    to: c.targetName,
    type: c.type,
    strength: c.strength,
    reason: c.reason,
  }));

  // ── Pre-compute change impact for all systems ─

  // Build import graphs for self-contained systems (no cross-system connections)
  // so the Impact view shows real file-level blast radius instead of "self-contained".
  const importGraphCache = new Map<string, ImportGraphStats>();
  for (const sys of analysis.systems) {
    const totalConns =
      (sys.connections?.incoming?.length || 0) +
      (sys.connections?.outgoing?.length || 0);
    if (totalConns === 0 && sys.systemTier === "primary") {
      const sysAbsRoot = path.join(repoPath, sys.rootPath === "." ? "" : sys.rootPath);
      try {
        const stats = await buildImportGraphStats(sysAbsRoot);
        if (stats.totalFiles > 0) importGraphCache.set(sys.id, stats);
      } catch {
        // Import graph is best-effort — never fail the analysis
      }
    }
  }

  const impactResults: Record<string, ChangeImpactResult> = {};
  for (const sys of analysis.systems) {
    const importStats = importGraphCache.get(sys.id);
    const result = analyzeChangeImpact(sys.id, analysis, repoStory, couplings, flows, importStats);
    if (result) impactResults[sys.id] = result;
  }

  // ── Assess analysis quality ─────────────────

  const quality = assessAnalysisQuality(analysis, repoStory, scanMeta);

  // ── Build aha summary + demo script ──────────

  const ahaSummary = generateAhaSummary(analysis, repoStory, impactResults);
  const demoScript = buildDemoScript(analysis.repoMode);

  // ── Detect logo ─────────────────────────────

  let logoDataUri: string | undefined;
  const repoNameLower = analysis.repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const logoCandidates = [
    "public/logo.svg", "public/logo.png", "public/logo.jpg",
    "public/icon.svg", "public/icon.png",
    "public/favicon.svg", "public/favicon.png",
    "public/images/logo.svg", "public/images/logo.png",
    "public/img/logo.svg", "public/img/logo.png",
    "static/logo.svg", "static/logo.png",
    "assets/logo.svg", "assets/logo.png",
    "apps/web/public/logo.svg", "apps/web/public/logo.png",
    "apps/web/public/icon.svg", "apps/web/public/icon.png",
    "apps/web/public/favicon.svg", "apps/web/public/favicon.png",
    `apps/web/public/${repoNameLower}-icon.svg`,
    `apps/web/public/${repoNameLower}.svg`,
    `apps/web/public/${repoNameLower}-icon.png`,
    "src/public/logo.svg", "src/public/logo.png",
    "logo.svg", "logo.png",
    "icon.svg", "icon.png",
  ];
  const mimeMap: Record<string, string> = {
    ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".ico": "image/x-icon", ".webp": "image/webp",
  };
  for (const candidate of logoCandidates) {
    const full = path.join(repoPath, candidate);
    try {
      const st = fsSync.statSync(full);
      if (st.isFile() && st.size < 200_000) {
        const ext = path.extname(candidate).toLowerCase();
        const mime = mimeMap[ext] || "image/png";
        const buf = fsSync.readFileSync(full);
        if (ext === ".svg") {
          logoDataUri = `data:${mime};utf8,${encodeURIComponent(buf.toString("utf-8"))}`;
        } else {
          logoDataUri = `data:${mime};base64,${buf.toString("base64")}`;
        }
        break;
      }
    } catch {}
  }
  if (!logoDataUri) {
    const iconDirs = ["public", "apps/web/public", "static", "assets"].map(d => path.join(repoPath, d));
    const iconPatterns = [/icon\.svg$/i, /icon\.png$/i, /logo.*\.svg$/i, /logo.*\.png$/i];
    outer: for (const dir of iconDirs) {
      try {
        const files = fsSync.readdirSync(dir);
        for (const pat of iconPatterns) {
          const match = files.find(f => pat.test(f) && !f.includes("white") && !f.includes("dark"));
          if (match) {
            const full = path.join(dir, match);
            const st = fsSync.statSync(full);
            if (st.isFile() && st.size < 200_000) {
              const ext = path.extname(match).toLowerCase();
              const mime = mimeMap[ext] || "image/png";
              const buf = fsSync.readFileSync(full);
              if (ext === ".svg") {
                logoDataUri = `data:${mime};utf8,${encodeURIComponent(buf.toString("utf-8"))}`;
              } else {
                logoDataUri = `data:${mime};base64,${buf.toString("base64")}`;
              }
              break outer;
            }
          }
        }
      } catch {}
    }
  }

  // ── Load tech icons ─────────────────────────

  const techIcons: Record<string, string> = {};
  const techIconMap: Record<string, string> = {
    "JavaScript": "javascript.svg",
    "TypeScript": "typescript.svg",
    "React": "react_dark.svg",
    "Next.js": "nextjs_icon_dark.svg",
    "Tailwind": "tailwindcss.svg",
    "Prisma": "prisma.svg",
    "Vite": "vite.svg",
    "Docker": "docker.svg",
    "Express": "expressjs.svg",
    "NestJS": "nestjs.svg",
    "HTML": "html5.svg",
    "CSS": "css.svg",
    "Markdown": "markdown-light.svg",
    "JSON": "json.svg",
    "Bun": "bun.svg",
    "Yarn": "yarn.svg",
    "npm": "npm.svg",
    "pnpm": "pnpm.svg",
    "Turborepo": "turborepo-icon-light.svg",
    "Vitest": "vite.svg",
  };
  const tIconDir = path.join(path.resolve(__dirname, ".."), "public", "tIcons");
  for (const [techName, fileName] of Object.entries(techIconMap)) {
    try {
      const svgPath = path.join(tIconDir, fileName);
      const svgContent = fsSync.readFileSync(svgPath, "utf-8");
      techIcons[techName] = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
    } catch {}
  }

  // ── Build app ────────────────────────────────

  const appData: AppData = { analysis, connectionGraph, focusViews, internalViews, impactResults, repoStory, ahaSummary, demoScript, logoDataUri, techIcons, quality };
  const appHtml = buildAppPage(appData);

  // ── Save JSON artifact ───────────────────────

  const outDir =
    outputDir ||
    process.env.MEMOR_OUTPUT_DIR?.trim() ||
    path.join(path.resolve(__dirname, ".."), "output");
  await fs.mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${repoSlug}-repo-analysis.json`);
  const jsonPayload = { ...analysis, impactResults, repoNarrative: analysis.repoNarrative };
  await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");

  // ── Optional exports ─────────────────────────

  if (doExport) {
    const { renderHtmlReport } = await import("./renderer/renderHtmlReport");
    const { renderMarkdownReport } = await import(
      "./renderer/renderMarkdownReport"
    );
    const { renderConnectionGraphHtml } = await import(
      "./renderer/renderConnectionGraph"
    );
    const { renderSystemFocusHtml } = await import(
      "./renderer/renderSystemFocusView"
    );

    await fs.writeFile(
      path.join(outDir, `${repoSlug}-memor-report.html`),
      renderHtmlReport(analysis, deprioritizedPaths),
      "utf8"
    );
    await fs.writeFile(
      path.join(outDir, `${repoSlug}-memor-report.md`),
      renderMarkdownReport(analysis, deprioritizedPaths),
      "utf8"
    );
    await fs.writeFile(
      path.join(outDir, `${repoSlug}-connection-graph.html`),
      renderConnectionGraphHtml(connectionGraph),
      "utf8"
    );
    for (const sys of analysis.systems) {
      const sfv = buildSystemFocusView(analysis, sys.id);
      if (!sfv) continue;
      await fs.writeFile(
        path.join(outDir, `${repoSlug}-focus-${slugify(sys.name)}.html`),
        renderSystemFocusHtml(sfv),
        "utf8"
      );
    }
    console.log(`  Exported to: ${outDir}`);
  }

  // ── Print summary ────────────────────────────

  const tc = { primary: 0, secondary: 0, support: 0 };
  for (const s of analysis.systems)
    tc[s.systemTier as keyof typeof tc]++;

  console.log("");
  console.log(
    `  ✓ ${analysis.systems.length} systems  (${tc.primary} primary · ${tc.secondary} secondary · ${tc.support} support)`
  );
  console.log(`  ✓ ${analysis.repoMode}`);
  console.log(`  ✓ ${quality.metrics.connectedSystems}/${quality.metrics.totalSystems} systems connected`);

  if (quality.confidence !== "high") {
    console.log("");
    const icon = quality.confidence === "low" ? "⚠" : "ℹ";
    const color = quality.confidence === "low" ? "\x1b[33m" : "\x1b[36m";
    console.log(`  ${color}${icon} ${quality.suggestion}\x1b[0m`);
    if (quality.concerns.length > 0 && quality.confidence === "low") {
      for (const c of quality.concerns) {
        console.log(`    · ${c.detail}`);
      }
    }
  }

  console.log("");

  // ── Start server ─────────────────────────────

  startAppServer(appHtml, port, (url) => {
    console.log(`  App:  \x1b[36m${url}\x1b[0m`);
    console.log(`  JSON: ${jsonPath}`);
    console.log("");
    console.log("  Press Ctrl+C to stop");
    console.log("");

    if (autoOpen) openBrowser(url);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
