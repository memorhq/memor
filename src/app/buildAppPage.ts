import * as fs from "fs";
import * as path from "path";
import type {
  RepoAnalysis,
  ConnectionGraphView,
  SystemFocusView,
  InternalArchitectureView,
} from "../types";
import type { RepoStory } from "../builders/generateRepoStory";
import type { ChangeImpactResult } from "../builders/analyzeChangeImpact";
import type { AhaSummary } from "../builders/generateAhaSummary";
import type { AnalysisQuality } from "../builders/assessAnalysisQuality";
import type { DemoScript } from "../demo/demoScript";

export type AppData = {
  analysis: RepoAnalysis;
  connectionGraph: ConnectionGraphView | null;
  focusViews: Record<string, SystemFocusView>;
  internalViews: Record<string, InternalArchitectureView>;
  impactResults?: Record<string, ChangeImpactResult>;
  repoStory?: RepoStory;
  ahaSummary?: AhaSummary;
  demoScript?: DemoScript;
  logoDataUri?: string;
  techIcons?: Record<string, string>;
  quality?: AnalysisQuality;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBundle(filename: string): string {
  const candidates = [
    path.join(__dirname, "..", filename),
    path.join(__dirname, filename),
    path.join(__dirname, "..", "..", "dist", filename),
    path.join(process.cwd(), "dist", filename),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {}
  }
  console.error(`  Warning: could not read ${filename}`);
  return "";
}

function appCss(): string {
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}

:root{
  --bg-page:#f0f0f0;
  --bg-surface:#ffffff;
  --bg-elevated:#f8fafc;
  --bg-inset:rgba(0,0,0,.04);
  --bg-topbar:rgba(255,255,255,.72);
  --bg-dock:#ffffff;
  --text-primary:#1a1a1a;
  --text-secondary:#334155;
  --text-muted:#64748b;
  --text-faint:#94a3b8;
  --text-on-surface:#27272a;
  --border-primary:rgba(0,0,0,.06);
  --border-secondary:rgba(0,0,0,.08);
  --border-strong:#e2e8f0;
  --shadow-card:0 2px 12px rgba(0,0,0,.08);
  --shadow-heavy:0 4px 24px rgba(0,0,0,.10);
  --dot-color:rgba(0,0,0,.10);
  --hover-bg:#f5f5f5;
  --active-bg:#f0f0f0;
  --chip-bg:rgba(0,0,0,.04);
  --chip-border:rgba(0,0,0,.08);
  --chip-text:#3f3f46;
  --qa-moderate-bg:rgba(59,130,246,.06);
  --qa-moderate-border:rgba(59,130,246,.15);
  --qa-moderate-text:#2563eb;
  --qa-low-bg:rgba(234,179,8,.07);
  --qa-low-border:rgba(234,179,8,.2);
  --qa-low-text:#b45309;
  --signals-bg:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%);
  --signals-border:rgba(217,119,6,.1);
  --signals-shadow:0 2px 12px rgba(0,0,0,.06);
}

[data-theme="dark"]{
  --bg-page:#1e1e1e;
  --bg-surface:#252526;
  --bg-elevated:#2d2d30;
  --bg-inset:rgba(255,255,255,.05);
  --bg-topbar:rgba(37,37,38,.85);
  --bg-dock:#252526;
  --text-primary:#d4d4d4;
  --text-secondary:#b0b0b0;
  --text-muted:#969696;
  --text-faint:#6a6a6a;
  --text-on-surface:#e4e4e7;
  --border-primary:rgba(255,255,255,.06);
  --border-secondary:rgba(255,255,255,.08);
  --border-strong:#3c3c3c;
  --shadow-card:0 2px 12px rgba(0,0,0,.3);
  --shadow-heavy:0 4px 24px rgba(0,0,0,.4);
  --dot-color:rgba(255,255,255,.06);
  --hover-bg:#2d2d30;
  --active-bg:#37373d;
  --chip-bg:rgba(255,255,255,.06);
  --chip-border:rgba(255,255,255,.08);
  --chip-text:#b0b0b0;
  --qa-moderate-bg:rgba(59,130,246,.1);
  --qa-moderate-border:rgba(59,130,246,.25);
  --qa-moderate-text:#93b4f8;
  --qa-low-bg:rgba(234,179,8,.1);
  --qa-low-border:rgba(234,179,8,.25);
  --qa-low-text:#fbbf24;
  --signals-bg:linear-gradient(135deg,#1a1a1f 0%,#1c1b18 100%);
  --signals-border:rgba(251,191,36,.08);
  --signals-shadow:0 4px 20px rgba(0,0,0,.3);
}

body{
  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:var(--bg-page);color:var(--text-primary);font-size:13px;line-height:1.5;
  -webkit-font-smoothing:antialiased;
}

/* ═══ App shell ═══ */
#app{display:flex;flex-direction:column;height:100vh}

/* ── Load animations ── */
.topbar,.dock,.seed-galaxy{
  opacity:0;transform:translateY(6px);
  transition:opacity .5s ease,transform .5s ease;
}
.app-loaded .topbar{
  opacity:1;transform:translateY(0);transition-delay:.05s;
}
.app-loaded .seed-galaxy{
  opacity:1;transform:translate(-50%,-50%) scale(1);
}
.app-loaded .dock{
  opacity:1;transform:translateY(-50%) translateX(0);transition-delay:.35s;
}

/* ── Top bar ── */
.topbar{
  height:48px;background:var(--bg-topbar);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  display:flex;align-items:center;padding:0 24px;flex-shrink:0;
  border-bottom:1px solid var(--border-primary);
  z-index:10;position:relative;
}
.topbar-brand{
  font-weight:700;font-size:15px;color:var(--text-primary);
  letter-spacing:-.03em;
}
.topbar-theme-toggle{
  margin-left:auto;background:none;border:none;cursor:pointer;
  padding:6px;border-radius:6px;color:var(--text-muted);
  display:flex;align-items:center;justify-content:center;
  transition:color .2s,background .2s;
}
.topbar-theme-toggle:hover{color:var(--text-primary);background:var(--hover-bg)}

/* ── Desktop workspace ── */
.desktop{
  flex:1;position:relative;overflow:hidden;
}

/* ── Dotted grid background ── */
.dotgrid{
  position:absolute;inset:0;
  background-image:radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
  background-size:24px 24px;
  background-position:12px 12px;
}

/* ═══ Center Seed Card ═══ */
/* ── Galaxy layout (multi-card overview) ── */
.seed-galaxy{
  position:absolute;top:48%;left:50%;
  transform:translate(-50%,-50%);
  z-index:15;
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
  width:720px;max-width:calc(100vw - 48px);
  color:var(--text-on-surface);font-family:inherit;
}
.seed-connectors{display:none}

.seed-card{
  background:var(--bg-surface);
  border-radius:14px;padding:18px 20px 16px;
  box-shadow:0 0 0 1px var(--border-primary),var(--shadow-card);
  color:var(--text-on-surface);font-family:inherit;
  opacity:0;transform:translateY(6px);
  animation:cardIn .4s ease forwards;
}
@keyframes cardIn{
  to{opacity:1;transform:translateY(0)}
}

.seed-card-identity{
  grid-column:1 / -1;
  animation-delay:.1s;
  border-top:2px solid rgba(99,102,241,.5);
}
.seed-card-flow{
  animation-delay:.18s;
  border-left:2px solid rgba(168,85,247,.45);
}
.seed-card-flow .seed-label{color:rgba(168,85,247,.75)}
.seed-card-flow .seed-label-entry{color:rgba(34,197,94,.7)}
.seed-entry-section{
  margin-top:14px;padding-top:12px;
  border-top:1px solid var(--border-primary);
}
.seed-card-zones{
  animation-delay:.2s;
  border-left:2px solid rgba(59,130,246,.5);
}
.seed-card-zones .seed-label{color:rgba(59,130,246,.75)}
.seed-card-signals{
  grid-column:1 / -1;
  animation-delay:.3s;
  margin-top:4px;
  border-left:2px solid rgba(217,119,6,.5);
  background:var(--signals-bg);
  box-shadow:0 0 0 1px var(--signals-border),var(--signals-shadow);
}
.seed-card-signals .seed-label{color:rgba(217,119,6,.85);letter-spacing:.14em}
.seed-card-sparse{
  grid-column:1 / -1;
  animation-delay:.2s;
}

.seed-header{
  display:flex;align-items:center;gap:10px;
  margin-bottom:4px;
}
.seed-logo{
  width:28px;height:28px;
  border-radius:6px;
  object-fit:contain;
  flex-shrink:0;
}
.seed-name{
  font-size:22px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.04em;line-height:1.2;
}

.seed-chips{
  display:flex;gap:6px;flex-wrap:wrap;
  margin-top:6px;margin-bottom:10px;
}
.seed-chip{
  font-size:11px;font-weight:500;
  padding:3px 9px;border-radius:999px;
  background:var(--chip-bg);
  border:1px solid var(--chip-border);
  color:var(--chip-text);
  letter-spacing:.01em;
  line-height:1.3;
  display:inline-flex;align-items:center;gap:4px;
}
.seed-chip-icon{
  width:13px;height:13px;opacity:.8;flex-shrink:0;
}

.seed-description{
  font-size:14px;color:var(--text-on-surface);
  line-height:1.5;margin-bottom:4px;font-style:italic;
}
.seed-identity{
  font-size:13px;color:var(--text-muted);
  line-height:1.4;margin-bottom:6px;
  letter-spacing:.005em;
}

.seed-stats{
  font-size:11px;color:var(--text-faint);
  display:flex;align-items:center;gap:4px;
  margin-bottom:14px;flex-wrap:wrap;
}
.seed-stats-detail{
  opacity:.7;
}
.seed-stats-sep{
  opacity:.3;
}

.seed-signals{
  margin-top:0;padding-top:0;
}
.seed-signal-list{
  display:flex;flex-direction:column;gap:3px;margin-top:4px;
}
.seed-signal{
  font-size:11px;color:var(--text-muted);
  display:flex;align-items:center;gap:6px;
  line-height:1.4;
}
.seed-signal-icon{
  flex-shrink:0;font-size:11px;opacity:.7;width:14px;text-align:center;
}
.seed-signal strong{
  color:var(--text-primary);font-weight:600;
}
.seed-signal-strength{
  opacity:.5;font-size:10px;font-weight:400;
}

.seed-section{
  margin-top:0;
}
.seed-label{
  display:block;
  font-size:10px;font-weight:700;text-transform:uppercase;
  color:var(--text-faint);
  letter-spacing:.12em;
  margin-bottom:6px;
}

.seed-flow{
  display:flex;flex-direction:column;
  gap:3px;
}
.seed-flow-row{
  display:flex;align-items:center;gap:6px;
}
.seed-flow-step{
  color:var(--text-muted);
  font-family:"SF Mono","Fira Code","Cascadia Code",monospace;
  font-size:12px;letter-spacing:.01em;
}
.seed-flow-end .seed-flow-step{
  color:var(--text-primary);font-weight:600;font-size:12.5px;
}
.seed-flow-arrow{
  color:#818cf8;
  font-size:12px;font-weight:700;
  display:inline-block;
  animation:arrow-drift 3s ease-in-out infinite;
}
.seed-flow-row:nth-child(2) .seed-flow-arrow{animation-delay:0s}
.seed-flow-row:nth-child(3) .seed-flow-arrow{animation-delay:.6s}
.seed-flow-row:nth-child(4) .seed-flow-arrow{animation-delay:1.2s}
.seed-flow-row:nth-child(5) .seed-flow-arrow{animation-delay:1.8s}
@keyframes arrow-drift{
  0%,100%{color:#6366f1;opacity:.4;transform:translateX(0)}
  50%{color:#a5b4fc;opacity:1;transform:translateX(3px)}
}

.seed-entry{
  display:flex;flex-direction:column;gap:4px;
}
.seed-entry-path{
  display:inline-block;max-width:100%;
  overflow:hidden;text-overflow:ellipsis;word-break:break-all;
  background:var(--bg-inset);
  padding:4px 10px;border-radius:6px;
  font-size:12px;color:var(--text-on-surface);
  font-family:"SF Mono","Fira Code","Cascadia Code",monospace;
  letter-spacing:.01em;
  border:1px solid var(--border-primary);
  width:fit-content;
}
.seed-entry-hint{
  font-size:11px;color:var(--text-faint);
  letter-spacing:.01em;
}

.seed-warning-text{
  margin:0;margin-top:8px;
  font-size:11.5px;color:rgba(234,179,8,.7);
  line-height:1.4;letter-spacing:.005em;
}

.seed-sparse{
  font-size:11px;color:var(--text-faint);
}

.qa-banner{
  margin:10px 0 6px;padding:8px 12px;border-radius:8px;font-size:12px;
  animation:fadeIn .3s ease;
}
<<<<<<< HEAD
.qa-moderate{background:var(--qa-moderate-bg);border:1px solid var(--qa-moderate-border);color:var(--qa-moderate-text)}
.qa-low{background:var(--qa-low-bg);border:1px solid var(--qa-low-border);color:var(--qa-low-text)}
=======
.qa-moderate{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:#93b4f8}
.qa-low{background:rgba(234,179,8,.1);border:1px solid rgba(234,179,8,.25);color:#fbbf24}
>>>>>>> ef42ce7 (Fix single-package repo detection)
.qa-banner-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qa-icon{font-size:14px}
.qa-label{font-weight:600;font-size:12px}
.qa-metric{font-size:11px;opacity:.7;margin-left:auto}
.qa-toggle{
  background:none;border:none;color:inherit;font-size:11px;cursor:pointer;
  text-decoration:underline;opacity:.7;padding:0;
}
.qa-toggle:hover{opacity:1}
.qa-concerns{margin-top:8px;padding-top:6px;border-top:1px solid var(--border-primary)}
.qa-concern{display:flex;gap:6px;font-size:11px;line-height:1.5;margin-bottom:2px;opacity:.85}
.qa-concern-dot{color:inherit;opacity:.4;flex-shrink:0}
.qa-suggestion{
  margin-top:6px;font-size:11px;font-style:italic;opacity:.7;
  padding:6px 8px;background:var(--bg-inset);border-radius:4px;
}
.seed-zones{
  display:flex;flex-wrap:wrap;gap:6px;
}
.seed-zone{
  display:flex;align-items:center;gap:5px;
  padding:4px 10px;border-radius:6px;
  background:var(--bg-inset);
  border:1px solid var(--border-primary);
}
.seed-zone-name{
  font-size:11px;color:var(--text-muted);
  font-weight:500;letter-spacing:.01em;
}
.seed-zone-count{
  font-size:10px;color:var(--text-faint);
  font-weight:600;
  min-width:14px;text-align:center;
  background:var(--bg-inset);
  padding:1px 5px;border-radius:4px;
}

/* ═══ Structure View ═══ */

/* -- canvas entrance zoom -- */
.str-canvas{
  position:absolute;inset:0;z-index:14;
  overflow:hidden;
  opacity:0;transform:scale(.94);
  transition:opacity .4s ease,transform .55s cubic-bezier(.22,1,.36,1);
}
.str-canvas.str-canvas-in{
  opacity:1;transform:scale(1);
}

/* -- top bar: back + breadcrumb -- */
.str-top{
  position:absolute;top:16px;left:20px;z-index:20;
  display:flex;align-items:center;gap:14px;
}
.str-back{
  display:inline-flex;align-items:center;gap:4px;
  padding:6px 14px;border-radius:8px;
  background:var(--bg-topbar);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid var(--border-secondary);
  color:var(--text-secondary);font-size:12px;font-weight:600;
  cursor:pointer;font-family:inherit;
  transition:all .15s;
  box-shadow:0 1px 4px rgba(0,0,0,.06);
}
.str-back:hover{
  background:var(--bg-surface);color:var(--text-primary);
  box-shadow:0 2px 8px rgba(0,0,0,.1);
}
.str-breadcrumb{
  display:flex;align-items:center;gap:6px;
  background:var(--bg-topbar);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  padding:5px 12px;border-radius:8px;
  border:1px solid var(--border-primary);
  box-shadow:0 1px 3px rgba(0,0,0,.04);
}
.str-bc-item{
  font-size:12px;font-weight:500;color:var(--text-muted);
  cursor:pointer;transition:color .15s;
}
.str-bc-item:hover{color:var(--text-primary)}
.str-bc-active{
  color:var(--text-primary);font-weight:600;cursor:default;
}
.str-bc-active:hover{color:var(--text-primary)}
.str-bc-sep{
  color:var(--text-faint);font-size:11px;
}
.str-bc-level{
  font-size:10px;font-weight:600;color:var(--text-faint);
  text-transform:uppercase;letter-spacing:.06em;
}

/* -- SVG edges -- */
.str-svg{
  position:absolute;top:0;left:0;
  pointer-events:none;z-index:1;
}
.str-edge{
  stroke:var(--border-secondary);
  stroke-width:1.5;
  stroke-dasharray:6 4;
  opacity:0;
  animation:str-edge-in .5s ease forwards;
  transition:stroke .2s,stroke-width .2s,stroke-dasharray .2s;
}
.str-edge-hot{
  stroke:rgba(99,102,241,.35);
  stroke-width:2;
  stroke-dasharray:none;
}
@keyframes str-edge-in{
  from{opacity:0;stroke-dashoffset:40}
  to{opacity:1;stroke-dashoffset:0}
}

/* -- center node (the "brain") -- */
.str-center-node{
  position:absolute;z-index:10;
  transform:translate(-50%,-50%);
  background:var(--bg-elevated);
  border-radius:14px;
  padding:20px 24px;
  min-width:190px;max-width:300px;
  text-align:center;
  box-shadow:0 0 0 1px var(--border-primary),var(--shadow-heavy),0 0 60px rgba(99,102,241,.12);
  color:var(--text-on-surface);
  opacity:0;transform:translate(-50%,-50%) scale(.85);
  transition:opacity .4s ease, transform .4s ease;
}
.str-center-node.str-node-in{
  opacity:1;transform:translate(-50%,-50%) scale(1);
  animation:str-breathe 4.5s ease-in-out .6s infinite;
}
@keyframes str-breathe{
  0%,100%{box-shadow:0 0 0 1px var(--border-primary),0 8px 32px rgba(0,0,0,.2),0 0 60px rgba(99,102,241,.12)}
  50%{box-shadow:0 0 0 1px var(--border-secondary),0 10px 40px rgba(0,0,0,.25),0 0 90px rgba(99,102,241,.22)}
}
.str-center-logo{
  width:24px;height:24px;
  border-radius:5px;object-fit:contain;
  margin:0 auto 6px;display:block;
}
.str-center-name{
  display:block;
  font-size:16px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.03em;line-height:1.2;
}
.str-center-chip{
  display:inline-block;
  margin-top:6px;
  font-size:10px;font-weight:500;
  padding:2px 8px;border-radius:999px;
  background:var(--chip-bg);
  color:var(--chip-text);
  text-transform:capitalize;
  letter-spacing:.02em;
}
.str-center-sub{
  display:block;margin-top:6px;
  font-size:11px;color:var(--text-secondary);
  line-height:1.4;
}

/* -- ring nodes -- */
.str-ring-node{
  position:absolute;z-index:10;
  transform:translate(-50%,-50%);
  background:var(--bg-surface);
  border:1.5px solid var(--border-strong);
  border-radius:10px;
  padding:12px 16px;
  min-width:130px;max-width:210px;
  text-align:center;
  box-shadow:var(--shadow-card);
  transition:border-color .2s,box-shadow .25s,transform .2s;
  opacity:0;transform:translate(-50%,-50%) scale(.8);
}
.str-ring-node.str-node-in{
  animation:str-ring-in .4s ease forwards;
}
@keyframes str-ring-in{
  from{opacity:0;transform:translate(-50%,-50%) scale(.8)}
  to{opacity:1;transform:translate(-50%,-50%) scale(1)}
}

/* size variation */
.str-ring-md{
  padding:14px 18px;min-width:140px;max-width:220px;
}
.str-ring-lg{
  padding:16px 20px;min-width:150px;max-width:230px;
}
.str-ring-lg .str-ring-name{font-size:13px}

/* hover affordance */
.str-clickable{cursor:pointer}
.str-clickable:hover{
  border-color:#6366f1;
  box-shadow:0 6px 20px rgba(99,102,241,.14),0 2px 8px rgba(0,0,0,.06);
  transform:translate(-50%,-50%) scale(1.05);
}
.str-selectable{cursor:pointer}
.str-selectable:hover{
  border-color:var(--text-faint);
  box-shadow:0 4px 14px rgba(0,0,0,.08);
  transform:translate(-50%,-50%) scale(1.03);
}
.str-ring-selected{
  border-color:#6366f1!important;
  box-shadow:0 0 0 3px rgba(99,102,241,.15),0 4px 16px rgba(99,102,241,.1)!important;
  transform:translate(-50%,-50%) scale(1.04)!important;
}

/* entry-point zone accent + pulse */
.str-ring-entry{
  border-left:3px solid #22c55e;
}
.str-ring-entry.str-node-in{
  animation:str-ring-in .4s ease forwards, str-entry-glow 3.5s ease-in-out 1.2s infinite;
}
@keyframes str-entry-glow{
  0%,100%{box-shadow:0 2px 8px rgba(0,0,0,.05)}
  50%{box-shadow:0 2px 8px rgba(0,0,0,.05),0 0 24px rgba(34,197,94,.12)}
}

/* system tier via opacity (implicit hierarchy) */
.str-tier-primary{opacity:1}
.str-tier-secondary{opacity:.78}
.str-tier-support{opacity:.55}

/* narrative strip */
.str-narrative{
  position:absolute;top:16px;right:20px;z-index:20;
  background:var(--bg-topbar);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  padding:6px 14px;border-radius:8px;
  border:1px solid var(--border-primary);
  box-shadow:0 1px 3px rgba(0,0,0,.04);
  font-size:11px;color:var(--text-muted);
  letter-spacing:.01em;
  max-width:280px;
  line-height:1.45;
}

/* edge hover tooltip */
.str-tooltip{
  position:absolute;z-index:25;
  transform:translate(-50%,-50%);
  background:rgba(15,23,42,.88);
  color:#e2e8f0;
  padding:4px 10px;border-radius:6px;
  font-size:10px;font-weight:500;
  white-space:nowrap;
  pointer-events:none;
  box-shadow:0 2px 8px rgba(0,0,0,.15);
  letter-spacing:.01em;
}

/* floating detail panel */
.str-detail{
  position:absolute;z-index:30;
  width:260px;
  background:var(--bg-surface);
  border:1px solid var(--border-strong);
  border-radius:12px;
  padding:14px 16px;
  box-shadow:var(--shadow-heavy);
  animation:str-detail-in .25s ease;
}
@keyframes str-detail-in{
  from{opacity:0;transform:scale(.95)}
  to{opacity:1;transform:scale(1)}
}
.str-detail-head{
  display:flex;align-items:center;justify-content:space-between;
  margin-bottom:6px;
}
.str-detail-name{
  font-size:14px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.02em;
}
.str-detail-close{
  background:none;border:none;color:var(--text-faint);
  font-size:16px;cursor:pointer;padding:0 2px;
  line-height:1;transition:color .15s;
}
.str-detail-close:hover{color:var(--text-primary)}
.str-detail-chips{
  display:flex;gap:4px;margin-bottom:8px;
}
.str-detail-chip{
  font-size:9px;font-weight:600;text-transform:uppercase;
  letter-spacing:.04em;
  padding:2px 7px;border-radius:4px;
  background:var(--bg-inset);color:var(--text-muted);
}
.str-detail-desc{
  font-size:11px;color:var(--text-secondary);line-height:1.5;
  margin:0 0 8px;
}
.str-detail-why{
  margin-bottom:8px;
}
.str-detail-why-label{
  display:block;
  font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:#6366f1;
  margin-bottom:2px;
}
.str-detail-why-text{
  display:block;
  font-size:10.5px;color:var(--text-secondary);line-height:1.4;
}
.str-detail-when{
  margin-bottom:8px;
}
.str-detail-when-label{
  display:block;
  font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:#059669;
  margin-bottom:2px;
}
.str-detail-when-text{
  display:block;
  font-size:10.5px;color:var(--text-secondary);line-height:1.4;
  font-style:italic;
}
.str-detail-flow{
  margin-bottom:8px;
  padding:6px 8px;
  background:var(--bg-elevated);
  border:1px solid var(--border-primary);
  border-radius:6px;
}
.str-detail-flow-label{
  display:block;
  font-size:9px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:#7c3aed;
  margin-bottom:3px;
}
.str-detail-flow-text{
  display:block;
  font-size:10px;color:var(--text-muted);line-height:1.4;
  font-family:"SF Mono","Fira Code","Cascadia Code",monospace;
}
.str-detail-conns{
  border-top:1px solid var(--border-primary);
  padding-top:6px;
  display:flex;flex-direction:column;gap:3px;
}
.str-detail-conn{
  display:flex;align-items:center;gap:5px;
  font-size:10px;
}
.str-conn-arrow{
  color:var(--text-faint);font-weight:700;font-size:11px;
  width:14px;text-align:center;flex-shrink:0;
}
.str-conn-name{
  color:var(--text-primary);font-weight:500;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  flex:1;
}
.str-conn-rel{
  color:var(--text-faint);font-size:9px;
  text-transform:uppercase;letter-spacing:.03em;
  flex-shrink:0;
}

.str-ring-name{
  display:block;
  font-size:12px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.01em;line-height:1.2;
}
.str-ring-count{
  display:inline-block;margin-top:4px;
  font-size:10px;font-weight:600;
  color:var(--text-muted);background:var(--bg-inset);
  padding:1px 7px;border-radius:4px;
}
.str-ring-sub{
  display:block;margin-top:5px;
  font-size:10.5px;color:var(--text-muted);
  line-height:1.35;
}
.str-ring-tech{
  display:flex;flex-wrap:wrap;gap:3px;
  margin-top:6px;justify-content:center;
}
.str-ring-tech-icon{
  width:16px;height:16px;
  object-fit:contain;
  border-radius:3px;
  opacity:.75;
  transition:opacity .15s,transform .15s;
}
.str-ring-tech-icon:hover{
  opacity:1;transform:scale(1.2);
}
.str-ring-tech-chip{
  font-size:9px;font-weight:500;
  padding:1px 6px;border-radius:4px;
  background:var(--bg-inset);color:#6366f1;
  letter-spacing:.01em;
  white-space:nowrap;
}
.str-ring-explore{
  display:block;margin-top:6px;
  font-size:9px;font-weight:500;
  color:#6366f1;
  letter-spacing:.02em;
  opacity:0;
  transition:opacity .15s;
}
.str-clickable:hover .str-ring-explore{
  opacity:1;
}
.str-more-hint{
  position:absolute;z-index:20;
  bottom:60px;left:50%;transform:translateX(-50%);
  background:var(--bg-topbar);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  padding:6px 16px;border-radius:8px;
  border:1px solid var(--border-primary);
  font-size:11px;font-weight:500;color:#6366f1;
  box-shadow:0 1px 3px rgba(0,0,0,.04);
  cursor:pointer;transition:all .15s;
  opacity:0;animation:str-more-in .3s ease 1s forwards;
}
@keyframes str-more-in{from{opacity:0}to{opacity:1}}
.str-more-hint:hover{
  background:var(--bg-surface);color:#4f46e5;
  box-shadow:0 2px 8px rgba(99,102,241,.12);
}
/* modal for hidden systems */
.str-modal-overlay{
  position:absolute;inset:0;z-index:40;
  background:rgba(0,0,0,.25);
  backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
  display:flex;align-items:center;justify-content:center;
  animation:str-detail-in .2s ease;
}
.str-modal{
  background:var(--bg-surface);
  border-radius:14px;
  border:1px solid var(--border-secondary);
  box-shadow:var(--shadow-heavy);
  width:380px;max-height:70vh;
  display:flex;flex-direction:column;
  overflow:hidden;
}
.str-modal-head{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 18px 10px;
  border-bottom:1px solid var(--border-primary);
}
.str-modal-bc{
  display:flex;align-items:center;gap:10px;
}
.str-modal-bc-back{
  font-size:11px;font-weight:600;color:#6366f1;
  cursor:pointer;transition:color .15s;
}
.str-modal-bc-back:hover{color:#4f46e5}
.str-modal-title{
  font-size:14px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.02em;
}
.str-modal-list{
  overflow-y:auto;padding:8px 12px 14px;
  display:flex;flex-direction:column;gap:8px;
}
.str-modal-item{
  padding:10px 14px;
  border:1px solid var(--border-strong);
  border-radius:10px;
  background:var(--bg-elevated);
  transition:border-color .15s,box-shadow .15s;
}
.str-modal-clickable{cursor:pointer}
.str-modal-clickable:hover{
  border-color:#6366f1;
  box-shadow:0 2px 10px rgba(99,102,241,.1);
}
.str-modal-item-top{
  display:flex;align-items:center;gap:8px;
  flex-wrap:wrap;
}
.str-modal-explore{
  display:block;margin-top:4px;
  font-size:9px;font-weight:500;color:#6366f1;
  letter-spacing:.02em;
}
.str-modal-name{
  display:block;
  font-size:13px;font-weight:700;color:var(--text-primary);
  letter-spacing:-.01em;
}
.str-modal-count{
  display:inline-block;margin-top:3px;
  font-size:10px;font-weight:600;
  color:var(--text-muted);background:var(--bg-inset);
  padding:1px 7px;border-radius:4px;
}
.str-modal-sub{
  display:block;margin-top:4px;
  font-size:11px;color:var(--text-muted);line-height:1.4;
}
.str-modal-tech{
  display:flex;flex-wrap:wrap;gap:3px;margin-top:6px;
}
.str-ring-start{
  display:block;margin-top:5px;
  font-size:9px;font-weight:600;
  color:#22c55e;
  letter-spacing:.04em;
  opacity:0;
  animation:str-start-in .4s ease 1.5s forwards;
}
@keyframes str-start-in{
  from{opacity:0}to{opacity:.6}
}

.str-empty-state{
  position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);
  display:flex;flex-direction:column;align-items:center;gap:6px;
  text-align:center;max-width:300px;z-index:5;
}
.str-empty-title{font-size:14px;font-weight:600;color:var(--text-faint);}
.str-empty-sub{font-size:12px;color:var(--text-faint);line-height:1.5;}

/* ── Flow View (light theme) ── */
.fv-screen{
  position:absolute;inset:0;z-index:14;
  display:flex;flex-direction:column;
  overflow:hidden;
}

/* Top bar */
.fv-topbar{
  display:flex;align-items:center;gap:12px;
  padding:14px 24px 10px;flex-shrink:0;
  border-bottom:1px solid var(--border-primary);
  padding-left:140px;
}
.fv-back,.iv-back{
  background:none;border:1px solid var(--border-strong);border-radius:8px;
  padding:5px 12px;font-size:12px;font-weight:500;color:var(--text-muted);
  cursor:pointer;transition:all .15s;flex-shrink:0;
  margin-right:4px;
}
.fv-back:hover,.iv-back:hover{background:var(--bg-elevated);color:var(--text-secondary);}

/* Flow list column */
.fv-flows-col{
  width:180px;flex-shrink:0;
  display:flex;flex-direction:column;gap:3px;
  align-self:flex-start;
  position:sticky;top:0;
}
.fv-flows-label{
  font-size:11px;font-weight:700;color:var(--text-faint);
  letter-spacing:.12em;text-transform:uppercase;
  margin-bottom:6px;
}
.fv-flow-tab{
  display:flex;align-items:center;gap:6px;
  padding:8px 10px;border-radius:8px;
  border:1px solid transparent;
  background:transparent;cursor:pointer;
  transition:all .15s;
  font-family:inherit;
  text-align:left;width:100%;
}
.fv-flow-tab:hover{background:var(--hover-bg)}
.fv-flow-tab-active{
  background:var(--bg-inset);border-color:rgba(99,102,241,.3);
}
.fv-flow-tab-title{
  font-size:13px;font-weight:600;color:var(--text-primary);
  line-height:1.3;flex:1;
}
.fv-flow-tab-active .fv-flow-tab-title{color:#4f46e5}
.fv-flow-tab-type{
  font-size:9px;font-weight:600;
  padding:2px 6px;border-radius:3px;
  background:var(--bg-inset);color:var(--text-faint);
  text-transform:uppercase;letter-spacing:.04em;
  flex-shrink:0;
}
.fv-flow-tab-active .fv-flow-tab-type{
  background:rgba(99,102,241,.1);color:#6366f1;
}

/* Body: three-column layout */
.fv-body{
  flex:1;
  display:flex;
  justify-content:center;
  gap:32px;
  padding:24px 28px 80px 140px;
  overflow-y:auto;
}
.fv-timeline-col{
  width:420px;flex-shrink:0;
  display:flex;flex-direction:column;
}
.fv-context-col{
  width:340px;flex-shrink:0;
  position:sticky;top:0;
  align-self:flex-start;
}

/* Timeline steps */
.fv-step{
  display:flex;align-items:flex-start;gap:14px;
  cursor:pointer;
  opacity:0;
  transition:transform .2s;
}
.fv-step-in{
  animation:fv-step-in .35s ease forwards;
}
@keyframes fv-step-in{
  from{opacity:0;transform:translateY(10px)}
  to{opacity:1;transform:translateY(0)}
}
.fv-step:hover{transform:scale(1.012)}
.fv-step:hover .fv-dot{
  box-shadow:0 0 0 5px rgba(99,102,241,.12);
}

/* Dot */
.fv-dot{
  width:10px;height:10px;flex-shrink:0;
  border-radius:50%;
  background:var(--text-faint);
  margin-top:6px;
  transition:all .25s;
  position:relative;
}
.fv-dot-active{
  background:#6366f1;
  box-shadow:0 0 0 6px rgba(99,102,241,.1);
}
.fv-dot-past{background:#a5b4fc}
.fv-dot-entry{
  background:#22c55e;
  width:12px;height:12px;
  margin-top:5px;
  box-shadow:0 0 0 5px rgba(34,197,94,.12);
}

/* Step body */
.fv-step-body{
  flex:1;
  background:var(--bg-surface);
  border:1px solid var(--border-strong);
  border-radius:12px;
  padding:14px 18px;
  transition:all .2s;
  box-shadow:0 1px 3px rgba(0,0,0,.03);
}
.fv-step:hover .fv-step-body{
  border-color:var(--text-faint);
  box-shadow:0 2px 8px rgba(0,0,0,.06);
}
.fv-step-active .fv-step-body{
  background:var(--bg-elevated);
  border-color:rgba(99,102,241,.3);
  border-left:2px solid #6366f1;
  box-shadow:0 2px 12px rgba(99,102,241,.08);
  transform:scale(1.012);
}
.fv-step-past .fv-step-body{
  opacity:.5;
}
.fv-step-title{
  display:block;
  font-size:14px;font-weight:600;
  color:var(--text-primary);
  letter-spacing:-.01em;
}
.fv-step-desc{
  display:block;margin-top:4px;
  font-size:12px;line-height:1.45;
  color:var(--text-muted);
}
.fv-step-systems{
  display:flex;flex-wrap:wrap;gap:4px;
  margin-top:8px;
}
.fv-step-sys{
  display:inline-block;
  padding:2px 8px;border-radius:5px;
  font-size:10px;font-weight:600;
  background:var(--bg-inset);color:var(--text-secondary);
  border:1px solid var(--border-primary);
  letter-spacing:.01em;
}
.fv-step-files{
  display:flex;flex-direction:column;gap:2px;
  margin-top:6px;
}
.fv-step-file{
  font-size:11px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--text-faint);
  line-height:1.3;
  display:flex;align-items:center;gap:6px;
}
.fv-step-file .fv-file-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fv-step-file .fv-file-path::before{content:"📄 ";font-size:10px}

/* Connector arrow */
.fv-connector{
  display:flex;align-items:center;justify-content:center;
  height:36px;
}
.fv-connector-arrow{
  font-size:20px;font-weight:700;
  color:var(--text-faint);
  transition:color .3s;
  line-height:1;
}
.fv-connector-past .fv-connector-arrow{
  color:#818cf8;
}
/* Context panel */
.fv-ctx{
  background:var(--bg-surface);
  border:1px solid var(--border-strong);
  border-radius:16px;
  padding:20px 22px;
  box-shadow:var(--shadow-card);
  opacity:0;
  animation:fv-ctx-enter .3s ease forwards;
}
@keyframes fv-ctx-enter{
  from{opacity:0;transform:translateX(8px)}
  to{opacity:1;transform:translateX(0)}
}
.fv-ctx-title{
  font-size:16px;font-weight:700;color:var(--text-primary);
  margin:0 0 14px;letter-spacing:-.02em;
  line-height:1.3;
}
.fv-ctx-label{
  font-size:10px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;
  color:var(--text-faint);
  margin-top:16px;margin-bottom:6px;
}
.fv-ctx-text{
  margin:0;font-size:13px;line-height:1.5;
  color:var(--text-secondary);
}
.fv-ctx-chips{
  display:flex;flex-wrap:wrap;gap:5px;
}
.fv-ctx-chip{
  display:inline-block;
  padding:3px 10px;border-radius:6px;
  font-size:11px;font-weight:600;
  background:var(--bg-inset);
  color:var(--text-secondary);
}
.fv-ctx-files{
  display:flex;flex-direction:column;gap:3px;
}
.fv-ctx-file{
  font-size:12px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  color:var(--text-secondary);line-height:1.4;
  background:var(--bg-elevated);
  border:1px solid var(--border-strong);
  border-radius:6px;
  cursor:pointer;
  transition:all .15s;
  text-decoration:none;display:block;
  padding:4px 10px;
}
.fv-ctx-file{
  display:flex;align-items:center;gap:8px;
}
.fv-ctx-file .fv-file-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fv-ctx-file:hover{
  border-color:rgba(99,102,241,.35);color:#6366f1;
  background:var(--bg-inset);
}

/* Copy button (shared) */
.fv-file-copy{
  flex-shrink:0;
  font-size:11px;font-weight:600;
  color:var(--text-faint);cursor:pointer;
  padding:1px 6px;border-radius:4px;
  transition:all .15s;
  font-family:inherit;
  white-space:nowrap;
}
.fv-file-copy:hover{color:#6366f1;background:rgba(99,102,241,.08)}

/* Empty state */
.fv-empty{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;
}
.fv-empty-title{
  font-size:16px;font-weight:700;color:var(--text-faint);
}
.fv-empty-sub{
  font-size:12px;color:var(--text-faint);max-width:280px;text-align:center;
}

/* ── Flow + Impact fusion ── */
.fv-summary-item{
  font-size:10px;font-weight:600;
  color:var(--text-faint);letter-spacing:.02em;
}
.fv-summary-hot{color:#f59e0b}
.fv-critical-toggle{
  font-size:9px;font-weight:700;
  letter-spacing:.06em;text-transform:uppercase;
  color:var(--text-faint);cursor:pointer;
  background:none;border:1px solid var(--border-strong);
  border-radius:5px;padding:3px 8px;
  transition:all .15s;margin-top:2px;
}
.fv-critical-toggle:hover{border-color:rgba(99,102,241,.35);color:#6366f1}
.fv-critical-on{border-color:#f59e0b;color:#f59e0b;background:rgba(245,158,11,.06)}

.fv-step-header-row{
  display:flex;align-items:center;gap:8px;
}
.fv-step-header-row .fv-step-title{flex:1}

.fv-impact-badge{
  flex-shrink:0;
  font-size:9px;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;
  padding:2px 8px;border-radius:4px;
  white-space:nowrap;
}
.fv-impact-high{
  background:rgba(245,158,11,.08);color:#b45309;
  border:1px solid rgba(245,158,11,.18);
}
.fv-impact-medium{
  background:rgba(245,158,11,.08);color:#d97706;
  border:1px solid rgba(245,158,11,.18);
}
.fv-impact-low{
  background:rgba(148,163,184,.08);color:var(--text-faint);
  border:1px solid rgba(148,163,184,.15);
}
.fv-impact-unknown{
  background:rgba(148,163,184,.05);color:var(--text-faint);
  border:1px solid rgba(148,163,184,.1);
}

/* Impact whisper inside step card */
.fv-step-whisper{
  display:block;
  font-size:11px;font-weight:500;
  margin-top:4px;
  line-height:1.3;
}
.fv-step-whisper-high{color:#b45309}
.fv-step-whisper-medium{color:#d97706}
.fv-step-whisper-low{color:var(--text-faint)}
.fv-step-whisper-unknown{color:var(--text-faint)}

/* Critical path emphasis — subtle, not alarming */
.fv-dot-critical{
  background:#f59e0b!important;
  width:11px;height:11px;
  margin-top:5px;
  box-shadow:0 0 0 4px rgba(245,158,11,.1);
}
.fv-dot-critical.fv-dot-active{
  box-shadow:0 0 0 6px rgba(245,158,11,.12);
}

.fv-step-dimmed{
  opacity:.3;pointer-events:auto;
  transition:opacity .3s;
}
.fv-step-dimmed:hover{opacity:.65}

/* Visual accent linking — left border on context panel */
.fv-ctx-accent-high{border-left:3px solid #f59e0b!important}
.fv-ctx-accent-medium{border-left:3px solid var(--border-strong)!important}
.fv-ctx-accent-low{border-left:3px solid var(--border-strong)!important}
.fv-ctx-accent-unknown{border-left:3px solid var(--border-strong)!important}

/* Context panel hero block */
.fv-ctx-hero{
  display:flex;align-items:center;gap:8px;
  margin-bottom:6px;
}
.fv-ctx-semantic{
  font-size:11px;font-weight:600;
  color:var(--text-muted);letter-spacing:.02em;
}
.fv-ctx-importance{
  font-size:13px;line-height:1.5;
  color:var(--text-secondary);font-weight:500;
  margin:0 0 8px;
}
.fv-ctx-reach{
  font-size:12px;font-weight:600;
  padding:6px 10px;border-radius:6px;
  margin-bottom:10px;
}
.fv-ctx-accent-high .fv-ctx-reach{
  background:rgba(245,158,11,.06);color:#92400e;
}
.fv-ctx-accent-medium .fv-ctx-reach{
  background:var(--bg-elevated);color:var(--text-muted);
}
.fv-ctx-accent-low .fv-ctx-reach,
.fv-ctx-accent-unknown .fv-ctx-reach{
  background:var(--bg-elevated);color:var(--text-muted);
}

/* Impact list */
.fv-ctx-impact-list{
  margin:0;padding-left:16px;
  font-size:12px;line-height:1.6;color:var(--text-secondary);
}
.fv-ctx-impact-list li{margin-bottom:2px}

.fv-ctx-impact-systems{
  display:flex;flex-wrap:wrap;gap:5px;
}
.fv-ctx-impact-sys{
  display:inline-block;
  padding:2px 8px;border-radius:5px;
  font-size:10px;font-weight:600;
}
.fv-ctx-impact-sys-high{
  background:rgba(239,68,68,.08);color:#ef4444;
  border:1px solid rgba(239,68,68,.15);
}
.fv-ctx-impact-sys-medium{
  background:rgba(245,158,11,.06);color:#d97706;
  border:1px solid rgba(245,158,11,.12);
}
.fv-ctx-impact-sys-low{
  background:var(--bg-elevated);color:var(--text-faint);
  border:1px solid var(--border-strong);
}
.fv-ctx-text-muted{color:var(--text-faint);font-style:italic;font-size:12px}

/* ── Impact View ── */
.iv-screen{
  position:absolute;inset:0;z-index:14;
  display:flex;flex-direction:column;
  overflow:hidden;
}

.iv-card-in{animation:iv-fade-in .3s ease forwards;}
@keyframes iv-fade-in{to{opacity:1;transform:translateY(0);}}

.iv-cat-tag{
  font-size:9px;font-weight:600;letter-spacing:.3px;
  padding:2px 8px;border-radius:4px;white-space:nowrap;
}
.iv-cat-tag.iv-cat-runtime{color:#818cf8;background:rgba(99,102,241,.1);}
.iv-cat-tag.iv-cat-build{color:#fbbf24;background:rgba(251,191,36,.1);}
.iv-cat-tag.iv-cat-api{color:#34d399;background:rgba(52,211,153,.1);}
.iv-cat-tag.iv-cat-integration{color:#a78bfa;background:rgba(167,139,250,.1);}
.iv-cat-tag.iv-cat-tooling{color:var(--text-muted);background:var(--bg-inset);}

/* Body: 3-column layout */
.iv-body{
  display:flex;flex:1;min-height:0;
  padding-left:140px;
  justify-content:center;
}

/* Left column: systems list */
.iv-systems-col{
  width:200px;flex-shrink:0;
  display:flex;flex-direction:column;gap:4px;
  padding:24px 16px;
  margin-left:32px;
  overflow-y:auto;
  background:var(--bg-surface);
  border-radius:14px;
  border:1px solid var(--border-strong);
  box-shadow:var(--shadow-card);
  align-self:center;
}
.iv-back{
  background:none;border:1px solid var(--border-strong);border-radius:8px;
  padding:6px 14px;font-size:12px;font-weight:500;color:var(--text-muted);
  cursor:pointer;transition:all .15s;text-align:left;margin-bottom:12px;
}
.iv-back:hover{background:var(--bg-elevated);color:var(--text-secondary);}
.iv-systems-label{
  font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;
  color:var(--text-faint);margin-bottom:8px;padding-left:2px;
}
.iv-sys-tab{
  display:flex;align-items:center;justify-content:space-between;
  gap:6px;padding:8px 10px;border-radius:8px;
  background:none;border:1px solid transparent;
  cursor:pointer;transition:all .15s;text-align:left;
  width:100%;
}
.iv-sys-tab:hover{background:var(--hover-bg);border-color:var(--border-strong);}
.iv-sys-tab-active{
  background:var(--bg-inset);border-color:rgba(99,102,241,.3);
}
.iv-sys-tab-name{
  font-size:14px;font-weight:500;color:var(--text-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.iv-sys-tab-active .iv-sys-tab-name{font-weight:700;color:#4f46e5;}
.iv-sys-tab-level{
  font-size:9px;font-weight:700;letter-spacing:.4px;
  padding:2px 6px;border-radius:3px;flex-shrink:0;
}
.iv-sys-tab-high{color:#f87171;background:rgba(239,68,68,.1);}
.iv-sys-tab-med{color:#fbbf24;background:rgba(251,191,36,.1);}
.iv-sys-tab-low{color:#4ade80;background:rgba(74,222,128,.1);}

/* Impact graph (center column) */
.iv-graph-col{
  flex:1;display:flex;align-items:center;justify-content:center;
  min-width:0;padding:24px 16px;
}
.iv-graph{
  position:relative;width:100%;max-width:640px;min-height:280px;
  display:flex;align-items:center;gap:0;
  opacity:0;
}
.iv-graph-in{animation:iv-fade-in .4s .1s ease forwards;}
.iv-edges{
  position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;
  overflow:visible;
}
.iv-edge{
  stroke:var(--text-faint);stroke-width:1.5;stroke-dasharray:6 4;
  transition:stroke .2s, stroke-width .2s;
}
.iv-edge-ind{stroke-dasharray:4 6;}
.iv-edge-hl{stroke:#6366f1;stroke-width:2.5;stroke-dasharray:none;}

.iv-tier{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:16px;z-index:1;position:relative;
}
.iv-tier-source{
  width:80px;flex-shrink:0;padding:0 10px;
}
.iv-source-dot{
  width:16px;height:16px;border-radius:50%;background:#4f46e5;
  box-shadow:0 0 0 5px rgba(79,70,229,.15);margin-bottom:8px;
}
.iv-source-label{
  font-size:11px;font-weight:600;color:var(--text-secondary);text-align:center;
  max-width:80px;word-break:break-word;line-height:1.3;
}
.iv-tier-1{flex:1;padding:10px 0;}
.iv-tier-2{flex:1;padding:10px 0;}

.iv-node{
  background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:10px;
  padding:10px 14px;display:flex;align-items:center;gap:8px;
  cursor:pointer;transition:all .18s;
  opacity:0;transform:translateX(-8px);
  min-width:130px;max-width:210px;
  box-shadow:var(--shadow-card);
}
.iv-node-in{animation:iv-node-enter .3s ease forwards;}
@keyframes iv-node-enter{to{opacity:1;transform:translateX(0);}}
.iv-node:hover{transform:scale(1.04);box-shadow:0 2px 12px rgba(0,0,0,.08);}
.iv-node-selected{border-color:#6366f1;box-shadow:0 0 0 2px rgba(99,102,241,.2);}
.iv-node-high{opacity:1;}
.iv-node-medium{opacity:.8;}
.iv-node-low{opacity:.55;}
.iv-node-name{
  font-size:12px;font-weight:600;color:var(--text-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;
}
.iv-node-risk{
  font-size:9px;font-weight:700;letter-spacing:.5px;
  padding:2px 6px;border-radius:4px;flex-shrink:0;
}
.iv-risk-high{background:rgba(239,68,68,.1);color:#f87171;}
.iv-risk-medium{background:rgba(251,191,36,.1);color:#fbbf24;}
.iv-risk-low{background:rgba(74,222,128,.1);color:#4ade80;}

.iv-graph-empty-wrap{
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  flex:1;padding:60px 20px;
}
.iv-graph-empty-title{
  font-size:14px;font-weight:600;color:var(--text-muted);margin-bottom:6px;
}
.iv-graph-empty{
  font-size:12px;color:var(--text-faint);text-align:center;max-width:260px;line-height:1.5;
}

/* Detail panel (right column) */
.iv-detail-col{
  width:320px;flex-shrink:0;
  padding:24px 16px 24px 0;
  overflow-y:auto;
  align-self:center;
}
.iv-detail{
  background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:14px;
  padding:22px;box-shadow:var(--shadow-card);
  animation:iv-fade-in .3s ease forwards;
}
.iv-detail-default{color:var(--text-secondary);}
.iv-detail-title{
  font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 4px;
}
.iv-detail-sys-type{
  font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;
  color:var(--text-faint);display:block;margin-bottom:8px;
}
.iv-detail-desc{
  font-size:13px;color:var(--text-muted);line-height:1.5;margin:0 0 12px;
}
.iv-detail-meta-row{
  display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;
}
.iv-detail-impact-level{
  font-size:10px;font-weight:700;letter-spacing:.5px;
}
.iv-detail-impact-level.iv-blast-high{color:#dc2626;}
.iv-detail-impact-level.iv-blast-med{color:#d97706;}
.iv-detail-impact-level.iv-blast-low{color:#16a34a;}
.iv-detail-meta-count{
  font-size:11px;color:var(--text-muted);
}
.iv-detail-cats{
  display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;
}
.iv-detail-hint{
  font-size:11px;color:var(--text-faint);font-style:italic;
}
.iv-detail-label{
  font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;
  color:var(--text-faint);margin:12px 0 4px;
}
.iv-detail-label:first-of-type{margin-top:0;}
.iv-detail-text{
  font-size:13px;color:var(--text-secondary);line-height:1.55;margin:0 0 4px;
}
.iv-detail-type-chip{
  display:inline-block;font-size:11px;font-weight:500;
  padding:3px 10px;border-radius:6px;
  background:var(--bg-elevated);color:var(--text-faint);border:1px solid var(--border-primary);
}
.iv-detail-type-chip.iv-cat-runtime{color:#818cf8;background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.2);}
.iv-detail-type-chip.iv-cat-build{color:#fbbf24;background:rgba(251,191,36,.1);border-color:rgba(251,191,36,.2);}
.iv-detail-type-chip.iv-cat-api{color:#34d399;background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.2);}
.iv-detail-type-chip.iv-cat-integration{color:#a78bfa;background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.2);}
.iv-detail-type-chip.iv-cat-tooling{color:var(--text-muted);background:var(--bg-elevated);border-color:var(--border-primary);}
.iv-detail-risk{
  display:inline-block;font-size:11px;font-weight:700;
  padding:3px 10px;border-radius:6px;letter-spacing:.3px;
}
.iv-detail-row{
  display:flex;gap:20px;margin:4px 0;
}
.iv-detail-break{
  color:#b45309;background:#fffbeb;border-radius:6px;padding:8px 10px;
  border-left:3px solid #f59e0b;font-size:12px;
}
.iv-detail-rec{
  color:#047857;background:#ecfdf5;border-radius:6px;padding:8px 10px;
  border-left:3px solid #10b981;font-size:12px;
}
.iv-detail-path{
  display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:4px;
}
.iv-path-chip{
  font-size:11px;font-weight:500;color:var(--text-secondary);
  background:var(--bg-inset);padding:3px 8px;border-radius:5px;
}
.iv-path-current{background:#eef2ff;color:#4f46e5;font-weight:600;}
.iv-path-arrow{font-size:12px;color:var(--text-faint);}
.iv-detail-zone{
  font-size:12px;color:var(--text-muted);
}
.iv-detail-files{
  display:flex;flex-direction:column;gap:4px;margin-top:4px;
}
.iv-detail-file{
  display:flex;align-items:center;gap:6px;
  font-size:11px;font-family:'SF Mono',monospace;color:var(--text-muted);
  padding:4px 8px;background:var(--bg-elevated);border-radius:5px;
  word-break:break-all;line-height:1.3;
}
.iv-file-path{
  flex:1;overflow:hidden;text-overflow:ellipsis;
}
.iv-file-copy{
  cursor:pointer;font-size:11px;color:var(--text-faint);
  flex-shrink:0;padding:1px 4px;border-radius:3px;
  transition:color .15s,background .15s;user-select:none;
}
.iv-file-copy:hover{color:#6366f1;background:var(--bg-inset);}
.iv-detail-blast-bar{
  width:100%;height:6px;background:var(--bg-inset);border-radius:3px;
  margin:6px 0 4px;overflow:hidden;
}
.iv-detail-blast-fill{
  height:100%;border-radius:3px;
  background:linear-gradient(90deg,#34d399,#fbbf24,#f87171);
  transition:width .4s ease;
}
.iv-detail-blast-score{
  font-size:11px;color:var(--text-faint);
}

/* ── Dock toolbar (left side) ── */
.dock{
  position:absolute;left:20px;top:50%;
  transform:translateY(-50%) translateX(-6px);
  z-index:20;
  display:flex;flex-direction:column;align-items:stretch;gap:4px;
  background:var(--bg-dock);
  border-radius:14px;padding:6px;
  box-shadow:var(--shadow-heavy);
  border:1px solid var(--border-primary);
}

.dock-item{
  display:flex;align-items:center;gap:7px;
  padding:8px 16px;border-radius:9px;
  border:none;background:transparent;cursor:pointer;
  color:var(--text-muted);
  transition:all .18s ease;
  font-family:inherit;font-size:12px;font-weight:500;
  letter-spacing:.01em;
  white-space:nowrap;
}
.dock-item:hover{
  background:var(--hover-bg);
  color:var(--text-primary);
  box-shadow:0 2px 8px rgba(0,0,0,.06);
}
.dock-active{
  background:var(--active-bg)!important;
  color:var(--text-primary)!important;
  font-weight:600;
  box-shadow:0 1px 4px rgba(0,0,0,.05);
}

.dock-icon{
  width:16px;height:16px;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
}
.dock-label{
  white-space:nowrap;
  color:inherit;
}
.dock-sep{
  width:100%;height:1px;background:var(--border-secondary);
  flex-shrink:0;
}
`;
}

/* OLD CSS removed — the styles above are all that's needed for the desktop shell */
const _OLD_LAYOUT = `
.layout{display:flex;flex:1;overflow:hidden;position:relative}

/* ═══ Sidebar ═══ */
.sidebar{
  width:200px;background:#0f172a;overflow-y:auto;flex-shrink:0;
  display:flex;flex-direction:column;
}
.sidebar::-webkit-scrollbar{width:3px}
.sidebar::-webkit-scrollbar-track{background:transparent}
.sidebar::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
.sidebar-search{padding:8px 10px 4px}
.sidebar-search input{
  width:100%;padding:5px 8px;border-radius:5px;border:1px solid #1e293b;
  background:#1e293b;color:#e2e8f0;font-size:11px;outline:none;
  font-family:inherit;
}
.sidebar-search input:focus{border-color:#3b82f6}
.sidebar-search input::placeholder{color:#475569}
.sidebar-group{padding-bottom:2px}
.sidebar-header{
  padding:10px 12px 3px;font-size:9px;font-weight:600;
  text-transform:uppercase;letter-spacing:.07em;color:#475569;
}
.sidebar-item{
  display:flex;align-items:center;gap:7px;padding:4px 12px;
  cursor:pointer;color:#94a3b8;font-size:12px;
  transition:all .1s;border-left:2px solid transparent;
}
.sidebar-item:hover{background:#1e293b;color:#e2e8f0}
.sidebar-item.active{background:#172554;color:#ffffff;border-left-color:#3b82f6}
.sidebar-overview-item{padding:6px 12px;margin-bottom:2px;border-bottom:1px solid #1e293b}
.sidebar-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0}
.sidebar-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sidebar-center{font-size:9px;color:#eab308}

/* ═══ Main panel — graph is the hero ═══ */
.main-panel{
  flex:1;display:flex;flex-direction:column;overflow:hidden;
  background:#fafbfc;
}
.top-bar{
  display:flex;align-items:center;gap:10px;padding:8px 16px;
  flex-shrink:0;flex-wrap:wrap;background:#ffffff;border-bottom:1px solid #f1f5f9;
}
.top-bar-name{font-size:14px;font-weight:600;color:#0f172a}
.back-btn{
  display:inline-flex;align-items:center;gap:3px;padding:4px 10px;
  background:none;border:1px solid #e2e8f0;border-radius:6px;
  color:#3b82f6;font-size:12px;cursor:pointer;font-family:inherit;
}
.back-btn:hover{background:#f8fafc;border-color:#3b82f6}
.view-toggle{display:flex;gap:2px;margin-left:auto}
.toggle-btn{
  padding:3px 10px;background:none;border:1px solid #e2e8f0;
  border-radius:5px;font-size:11px;cursor:pointer;color:#64748b;
  font-family:inherit;transition:all .15s;
}
.toggle-btn:hover{border-color:#94a3b8}
.toggle-btn.active{background:#0f172a;color:#ffffff;border-color:#0f172a}

/* Graph fills all remaining space */
.graph-hero{
  flex:1;min-height:0;position:relative;
}
.graph-hero .react-flow{height:100%!important}

/* Floating context card */
.graph-context-card{
  position:absolute;top:12px;left:12px;z-index:5;
  background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
  border:1px solid #f1f5f9;border-radius:8px;
  padding:8px 14px;font-size:12px;color:#475569;
  max-width:360px;line-height:1.5;
  box-shadow:0 1px 4px rgba(0,0,0,.04);
  pointer-events:none;
}

/* Edge legend */
.graph-legend{
  position:absolute;bottom:14px;left:14px;z-index:5;
  background:rgba(255,255,255,.92);backdrop-filter:blur(8px);
  border:1px solid #f1f5f9;border-radius:8px;
  padding:8px 12px;display:flex;gap:14px;
  box-shadow:0 1px 4px rgba(0,0,0,.04);
  pointer-events:none;
}
.legend-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b}

/* ═══ Detail drawer (slide-over from right) ═══ */
.drawer-backdrop{
  position:fixed;inset:0;z-index:40;
  background:rgba(15,23,42,.12);
  animation:fadeIn .15s ease;
}
.detail-drawer{
  position:fixed;top:0;right:0;bottom:0;z-index:50;
  width:360px;max-width:90vw;background:#ffffff;
  box-shadow:-4px 0 24px rgba(0,0,0,.08);
  overflow-y:auto;
  animation:slideIn .2s ease;
}
.drawer-close{
  position:sticky;top:0;right:0;z-index:1;float:right;
  margin:12px 12px 0 0;
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
  width:28px;height:28px;display:flex;align-items:center;justify-content:center;
  font-size:14px;color:#64748b;cursor:pointer;
}
.drawer-close:hover{background:#f1f5f9;color:#0f172a}
.drawer-body{padding-top:8px}
.drawer-header{padding:16px 20px 10px}
.drawer-header h2{font-size:17px;font-weight:700;color:#0f172a;margin-bottom:6px;letter-spacing:-.02em}

@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}

/* ═══ Detail sections ═══ */
.detail-badges{display:flex;gap:5px;flex-wrap:wrap}
.detail-section{padding:12px 20px;border-top:1px solid #f8fafc}
.detail-section h3{
  font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:.05em;color:#94a3b8;margin-bottom:5px;
}
.detail-section p{font-size:13px;color:#334155;line-height:1.55}
.detail-hint{font-size:11px;color:#94a3b8;margin-top:3px}

/* ═══ Badges ═══ */
.badge{
  display:inline-flex;align-items:center;padding:2px 7px;
  border-radius:4px;font-size:10px;font-weight:500;line-height:1.4;
}
.badge.tier-primary{background:#0f172a;color:#f8fafc}
.badge.tier-secondary{background:#475569;color:#f1f5f9}
.badge.tier-support{background:#e2e8f0;color:#475569}
.badge.mode{background:#eff6ff;color:#1d4ed8}
.badge.type{background:#f8fafc;color:#64748b;border:1px solid #f1f5f9}

/* ═══ Start path ═══ */
.start-path{
  display:block;padding:6px 10px;background:#f8fafc;border:1px solid #f1f5f9;
  border-radius:6px;font-family:"SF Mono","Fira Code","Cascadia Code",monospace;
  font-size:11px;color:#1e293b;word-break:break-all;
}

/* ═══ Connection items ═══ */
.conn-item{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px}
.conn-target{color:#3b82f6;cursor:pointer}
.conn-target:hover{text-decoration:underline}
.conn-conf{margin-left:auto;font-size:10px;color:#cbd5e1}
.conn-group-label{
  font-size:9px;font-weight:600;color:#94a3b8;
  text-transform:uppercase;letter-spacing:.04em;padding:6px 0 2px;
}

/* ═══ Tags ═══ */
.tag{display:inline-flex;padding:2px 7px;background:#f8fafc;border:1px solid #f1f5f9;border-radius:4px;font-size:10px;color:#64748b}
.tag-wrap{display:flex;flex-wrap:wrap;gap:3px}

/* ═══ Aha Summary ═══ */
.aha-panel{
  background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
  color:#f8fafc;border-radius:14px;padding:28px 32px;margin-bottom:20px;
}
.aha-headline{
  font-size:20px;font-weight:800;line-height:1.3;letter-spacing:-.03em;
  margin-bottom:6px;
}
.aha-sub{
  font-size:14px;color:#94a3b8;line-height:1.5;margin-bottom:16px;
}
.aha-bullets{
  list-style:none;padding:0;margin:0 0 14px;
}
.aha-bullets li{
  font-size:13px;color:#cbd5e1;line-height:1.6;
  padding-left:16px;position:relative;
}
.aha-bullets li::before{
  content:"→";position:absolute;left:0;color:#6366f1;font-weight:700;
}
.aha-warnings{display:flex;flex-direction:column;gap:6px;margin-top:10px}
.aha-warning{
  font-size:12px;color:#fbbf24;background:rgba(251,191,36,.08);
  border:1px solid rgba(251,191,36,.15);border-radius:6px;
  padding:6px 12px;line-height:1.4;
}

/* ═══ At-a-Glance ═══ */
.glance-panel{
  background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;
  padding:16px 20px;margin-bottom:20px;
}
.glance-title{
  font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
  color:#94a3b8;margin-bottom:10px;
}
.glance-grid{
  display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;
}
.glance-stat{
  background:#f8fafc;border-radius:8px;padding:8px 12px;
}
.glance-stat.glance-warn{background:#fef2f2;border:1px solid #fecaca}
.glance-stat-label{font-size:10px;color:#94a3b8;font-weight:500;margin-bottom:2px}
.glance-stat-value{font-size:14px;font-weight:700;color:#0f172a}
.glance-stat-sub{font-size:10px;color:#64748b;margin-top:1px}

/* ═══ Quick-focus Chips ═══ */
.quick-chips{
  display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px;
}
.quick-chip{
  display:inline-flex;align-items:center;gap:4px;
  padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;
  border:1px solid #e2e8f0;background:#ffffff;color:#334155;
  cursor:pointer;transition:all .15s;font-family:inherit;
}
.quick-chip:hover{border-color:#6366f1;color:#6366f1;background:#eef2ff}
.chip-start{border-color:#16a34a;color:#166534;background:#f0fdf4}
.chip-start:hover{background:#dcfce7}
.chip-flow{border-color:#6366f1;color:#4338ca;background:#eef2ff}
.chip-flow:hover{background:#e0e7ff}
.chip-coupling{border-color:#f59e0b;color:#92400e;background:#fffbeb}
.chip-coupling:hover{background:#fef3c7}
.chip-risk{border-color:#ef4444;color:#991b1b;background:#fef2f2}
.chip-risk:hover{background:#fee2e2}

/* ═══ Section Headers ═══ */
.arch-section-hd{margin-bottom:12px}
.arch-section-title{
  font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:#0f172a;
}
.arch-section-micro{
  font-size:12px;color:#94a3b8;margin-top:2px;
}

/* ═══ Show More Button ═══ */
.show-more-btn{
  display:block;width:100%;padding:8px;margin-top:8px;
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
  font-size:12px;font-weight:500;color:#6366f1;cursor:pointer;
  font-family:inherit;transition:all .15s;
}
.show-more-btn:hover{background:#eef2ff;border-color:#6366f1}

/* ═══ Risk Badges ═══ */
.risk-badge{
  display:inline-flex;align-items:center;padding:1px 6px;
  border-radius:4px;font-size:9px;font-weight:700;
  text-transform:uppercase;letter-spacing:.03em;
}
.risk-contained{background:#fffbeb;color:#d97706}
.risk-broad{background:#fff1f2;color:#e11d48}
.risk-architectural{background:#fef2f2;color:#dc2626}

/* ═══ Reading name row ═══ */
.arch-reading-name-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}

/* ═══ System card header ═══ */
.arch-item-header{display:flex;align-items:center;justify-content:space-between;gap:6px}

/* ═══ Section spacing ═══ */
.arch-map section{margin-bottom:28px}

/* ═══ Architecture Map (structured overview) ═══ */
.arch-map-container{
  flex:1;overflow-y:auto;padding:28px 32px 60px;
  scroll-behavior:smooth;
}
.arch-map{
  max-width:820px;margin:0 auto;
}

.arch-repo-header{
  display:flex;align-items:center;gap:10px;margin-bottom:20px;
}
.arch-repo-type{
  font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;
  color:#6366f1;background:#eef2ff;padding:3px 10px;border-radius:6px;
}
.arch-repo-count{
  font-size:12px;color:#94a3b8;
}

.arch-center{
  background:#0f172a;color:#f8fafc;border-radius:12px;
  padding:20px 28px;text-align:center;cursor:pointer;
  box-shadow:0 4px 20px rgba(15,23,42,.15);
  transition:box-shadow .2s;margin-bottom:16px;
}
.arch-center:hover{box-shadow:0 6px 28px rgba(15,23,42,.22)}
.arch-center-star{font-size:11px;color:#eab308;margin-bottom:4px}
.arch-center-name{font-size:20px;font-weight:700;letter-spacing:-.02em}
.arch-center-sub{font-size:12px;color:#94a3b8;margin-top:4px;line-height:1.4}
.arch-tech-row{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:8px}
.arch-tech-pill{
  font-size:10px;padding:2px 8px;border-radius:10px;
  background:rgba(255,255,255,.12);color:rgba(255,255,255,.7);
}
.arch-tech-sm .arch-tech-pill{
  background:#f1f5f9;color:#64748b;
}

.arch-start{
  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
  padding:10px 16px;margin-bottom:24px;
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
}
.arch-start-label{
  font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;
  color:#166534;
}
.arch-start-path{
  font-family:"SF Mono","Fira Code",monospace;font-size:12px;
  color:#166534;background:rgba(22,101,52,.08);padding:2px 8px;border-radius:4px;
}
.arch-start-reason{font-size:11px;color:#4ade80;margin-left:auto}

/* ═══ Flows ═══ */
.arch-flows-section{margin-bottom:28px}
.arch-flows-header{
  font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;
  color:#94a3b8;padding:0 4px 10px;
}
.arch-flow-card{
  background:#ffffff;border:1px solid #f1f5f9;border-radius:10px;
  padding:14px 18px;margin-bottom:10px;
}
.arch-flow-title{
  font-size:13px;font-weight:600;color:#0f172a;
  display:flex;align-items:center;gap:8px;margin-bottom:10px;
}
.arch-flow-type-badge{
  font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;
  padding:2px 7px;border-radius:4px;
  background:#f1f5f9;color:#64748b;
}
.arch-flow-confidence{font-size:10px;color:#94a3b8;margin-left:auto}
.arch-conf-high{color:#16a34a}
.arch-conf-medium{color:#ca8a04}
.arch-conf-low{color:#94a3b8}
.arch-flow-steps{display:flex;flex-wrap:wrap;align-items:flex-start;gap:4px}
.arch-flow-step{display:flex;align-items:flex-start;gap:4px}
.arch-flow-arrow{
  color:#cbd5e1;font-size:14px;line-height:1;padding-top:3px;flex-shrink:0;
}
.arch-flow-step-inner{
  background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;
  padding:6px 10px;min-width:0;
}
.arch-flow-step-label{
  display:block;font-size:12px;font-weight:600;color:#334155;
}
.arch-flow-step-desc{
  display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:2px;
}

.arch-group{margin-bottom:20px}
.arch-group-label{
  font-size:11px;font-weight:600;text-transform:uppercase;
  letter-spacing:.05em;color:#94a3b8;
  padding:0 4px 4px;display:flex;align-items:center;gap:6px;
}
.arch-zone-icon{font-size:12px;flex-shrink:0}
.arch-zone-desc{
  font-size:12px;color:#64748b;line-height:1.5;
  padding:0 4px 8px;
}
.arch-group-count{
  font-size:10px;color:#cbd5e1;font-weight:400;
  margin-left:2px;
}

.arch-items{
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));
  gap:8px;
}

.arch-item-card{
  background:#ffffff;border:1px solid #f1f5f9;border-radius:8px;
  padding:12px 16px;cursor:pointer;
  transition:border-color .15s, box-shadow .15s;
}
.arch-item-card:hover{border-color:#cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.arch-item-name{font-size:13px;font-weight:600;color:#0f172a}
.arch-item-sub{font-size:11px;color:#64748b;margin-top:3px;line-height:1.4}

.arch-compact-list{
  display:flex;flex-wrap:wrap;gap:4px;padding:0 4px;
}
.arch-member{
  font-size:12px;font-weight:500;color:#334155;
  background:#ffffff;border:1px solid #e2e8f0;border-radius:5px;
  padding:3px 10px;
}

/* ═══ Reading Order ═══ */
.arch-reading-section{margin-bottom:28px}
.arch-section-header{
  font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;
  color:#94a3b8;padding:0 4px 10px;
}
.arch-reading-list{display:flex;flex-direction:column;gap:6px}
.arch-reading-step{
  display:flex;align-items:flex-start;gap:12px;
  background:#fff;border:1px solid #f1f5f9;border-radius:8px;
  padding:10px 16px;transition:border-color .15s, box-shadow .15s;
}
.arch-reading-step:hover{border-color:#cbd5e1;box-shadow:0 2px 8px rgba(0,0,0,.04)}
.arch-reading-num{
  flex-shrink:0;width:24px;height:24px;
  display:flex;align-items:center;justify-content:center;
  background:#0f172a;color:#f8fafc;border-radius:50%;
  font-size:11px;font-weight:700;margin-top:2px;
}
.arch-reading-body{min-width:0}
.arch-reading-name{font-size:13px;font-weight:600;color:#0f172a}
.arch-reading-zone{
  font-size:10px;font-weight:500;color:#6366f1;
  background:#eef2ff;padding:1px 7px;border-radius:4px;
  margin-left:8px;
}
.arch-reading-reason{font-size:12px;color:#64748b;line-height:1.4;margin-top:3px}

/* ═══ Couplings ═══ */
.arch-couplings-section{margin-bottom:28px}
.arch-coupling-list{display:flex;flex-direction:column;gap:6px}
.arch-coupling-card{
  background:#fff;border:1px solid #f1f5f9;border-radius:8px;
  padding:10px 16px;transition:border-color .15s;
}
.arch-coupling-high{border-left:3px solid #ef4444}
.arch-coupling-medium{border-left:3px solid #f59e0b}
.arch-coupling-low{border-left:3px solid #94a3b8}
.arch-coupling-header{
  display:flex;align-items:center;gap:6px;flex-wrap:wrap;
}
.arch-coupling-from,.arch-coupling-to{
  font-size:13px;font-weight:600;color:#0f172a;
}
.arch-coupling-arrow{color:#cbd5e1;font-size:13px}
.arch-coupling-badge{
  font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;
  padding:2px 7px;border-radius:4px;margin-left:auto;
}
.arch-badge-high{background:#fef2f2;color:#dc2626}
.arch-badge-medium{background:#fffbeb;color:#d97706}
.arch-badge-low{background:#f8fafc;color:#94a3b8}
.arch-coupling-type-badge{
  font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.03em;
  padding:2px 7px;border-radius:4px;
  background:#f1f5f9;color:#64748b;
}
.arch-coupling-reason{font-size:12px;color:#64748b;line-height:1.4;margin-top:4px}

/* ═══ Change Impact ═══ */
.impact-section{border-top:1px solid #f1f5f9;padding-top:16px;margin-top:8px}
.impact-blast-badge{
  display:flex;align-items:center;gap:12px;
  border:1px solid;border-radius:10px;padding:12px 16px;margin:8px 0 12px;
}
.impact-blast-score{display:flex;align-items:baseline;gap:2px}
.impact-blast-num{font-size:28px;font-weight:800;line-height:1}
.impact-blast-max{font-size:12px;color:#94a3b8;font-weight:500}
.impact-blast-label{display:flex;flex-direction:column;gap:2px}
.impact-blast-level{
  font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
}
.impact-blast-conf{font-size:10px;color:#94a3b8}
.impact-summary{font-size:12px;color:#475569;line-height:1.5;margin-bottom:14px}
.impact-group{margin-bottom:12px}
.impact-group-label{
  font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;
  color:#94a3b8;padding:0 0 6px;display:flex;align-items:center;gap:6px;
}
.impact-group-count{
  font-size:9px;background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:8px;
}
.impact-row{
  padding:8px 10px;border:1px solid #f1f5f9;border-radius:6px;
  margin-bottom:4px;cursor:pointer;transition:border-color .15s;
}
.impact-row:hover{border-color:#cbd5e1}
.impact-row-header{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.impact-row-name{font-size:12px;font-weight:600;color:#0f172a}
.impact-risk-badge{
  font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;
  padding:1px 6px;border-radius:4px;margin-left:auto;
}
.impact-type-badge{
  font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:.03em;
  padding:1px 6px;border-radius:4px;background:#f1f5f9;color:#64748b;
}
.impact-row-reason{font-size:11px;color:#64748b;line-height:1.4;margin-top:3px}
.impact-row-via{font-size:10px;color:#a78bfa;margin-top:2px;font-style:italic}

/* ═══ React Flow overrides ═══ */
.react-flow__panel{font-family:inherit!important}
.react-flow__controls{opacity:.5;transition:opacity .2s}
.react-flow__controls:hover{opacity:1}
.react-flow__edge-textbg{rx:4}
.react-flow__edge:hover .react-flow__edge-path{stroke-opacity:1!important;stroke-width:2.5px!important}

/* ═══════════════════════════════════════════════════════════════════
   ARCHITECTURE CANVAS
   ═══════════════════════════════════════════════════════════════════ */

/* -- header view toggle -- */
.header-view-toggle{display:flex;gap:2px;margin-left:auto;background:#f1f5f9;border-radius:8px;padding:2px}
.hv-btn{
  border:none;background:transparent;color:#64748b;font-size:11px;font-weight:600;
  padding:4px 12px;border-radius:6px;cursor:pointer;transition:all .15s;
  font-family:inherit;letter-spacing:.01em;
}
.hv-btn:hover{color:#0f172a;background:rgba(15,23,42,.04)}
.hv-active{background:#ffffff!important;color:#0f172a!important;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.cmd-trigger{
  border:1px solid #e2e8f0;background:#f8fafc;color:#94a3b8;width:28px;height:28px;
  border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:600;transition:all .15s;font-family:inherit;
}
.cmd-trigger:hover{border-color:#cbd5e1;color:#64748b}
.cmd-trigger-slash{font-size:13px}

/* -- canvas container -- */
.canvas-container{flex:1;overflow:hidden;display:flex;flex-direction:column}

/* -- canvas root -- */
.cv-root{display:flex;flex-direction:column;height:100%;background:#fafbfc}
.cv-empty{display:flex;align-items:center;justify-content:center;height:100%;color:#64748b;font-size:14px;background:#fafbfc}

/* -- aha strip -- */
.cv-aha-strip{
  padding:8px 20px;background:#ffffff;
  border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:16px;flex-shrink:0;
}
.cv-aha-headline{color:#0f172a;font-weight:700;font-size:14px;letter-spacing:-.02em}
.cv-aha-sub{color:#64748b;font-size:12px}

/* -- toolbar -- */
.cv-toolbar{
  display:flex;align-items:center;gap:12px;padding:6px 16px;
  background:#ffffff;border-bottom:1px solid #e2e8f0;flex-shrink:0;flex-wrap:wrap;
}

/* -- breadcrumbs -- */
.cv-breadcrumbs{display:flex;align-items:center;gap:4px}
.cv-crumb{
  color:#94a3b8;font-size:12px;cursor:pointer;padding:3px 8px;border-radius:4px;
  transition:all .15s;font-weight:500;
}
.cv-crumb:hover{color:#0f172a;background:rgba(15,23,42,.04)}
.cv-crumb-active{color:#0f172a;font-weight:600;cursor:default}
.cv-crumb-active:hover{background:transparent}
.cv-crumb-sep{color:#cbd5e1;font-size:12px}

/* -- mode toggle -- */
.cv-mode-toggle{display:flex;gap:2px;background:#f1f5f9;border-radius:8px;padding:2px}
.cv-mode-btn{
  border:none;background:transparent;color:#64748b;font-size:11px;font-weight:600;
  padding:5px 14px;border-radius:6px;cursor:pointer;transition:all .15s;
  font-family:inherit;display:flex;align-items:center;gap:5px;
}
.cv-mode-btn:hover{color:#0f172a;background:rgba(15,23,42,.04)}
.cv-mode-active{background:#ffffff!important;color:#0f172a!important;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.cv-mode-icon{font-size:12px}

/* -- flow selector -- */
.cv-flow-selector{display:flex;align-items:center;gap:8px}
.cv-flow-select{
  background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;font-size:11px;
  padding:4px 10px;border-radius:6px;font-family:inherit;cursor:pointer;
}
.cv-flow-progress{color:#7c3aed;font-size:11px;font-weight:600}

/* -- impact selector -- */
.cv-impact-selector{display:flex;align-items:center;gap:8px}
.cv-impact-select{
  background:#ffffff;border:1px solid #e2e8f0;color:#0f172a;font-size:11px;
  padding:4px 10px;border-radius:6px;font-family:inherit;cursor:pointer;
}
.cv-impact-badge{font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px}

/* -- body layout -- */
.cv-body{display:flex;flex:1;overflow:hidden}
.cv-canvas{flex:1;position:relative;background:#fafbfc}
.cv-canvas .react-flow{background:#fafbfc!important}
.cv-canvas .react-flow__controls{
  background:#ffffff!important;border:1px solid #e2e8f0!important;
  border-radius:8px!important;box-shadow:0 1px 4px rgba(0,0,0,.06)!important;
}
.cv-canvas .react-flow__controls button{
  background:#ffffff!important;color:#64748b!important;border-color:#e2e8f0!important;
}
.cv-canvas .react-flow__controls button:hover{background:#f1f5f9!important;color:#0f172a!important}
.cv-canvas .react-flow__controls svg{fill:#64748b!important}
.cv-canvas .react-flow__controls button:hover svg{fill:#0f172a!important}
.cv-canvas .react-flow__minimap{
  background:#ffffff!important;border:1px solid #e2e8f0!important;border-radius:8px!important;
  box-shadow:0 1px 4px rgba(0,0,0,.06)!important;
}

/* -- detail pane (right side) -- */
.cv-detail-pane{
  width:380px;overflow-y:auto;background:#ffffff;border-left:1px solid #e2e8f0;
  flex-shrink:0;
}
.cv-detail{padding:16px}
.cv-detail-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.cv-detail-name{color:#0f172a;font-size:16px;font-weight:700;letter-spacing:-.02em;margin:0}
.cv-detail-close{
  background:transparent;border:none;color:#94a3b8;font-size:16px;cursor:pointer;
  padding:4px;border-radius:4px;transition:color .15s;
}
.cv-detail-close:hover{color:#0f172a}
.cv-detail-badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cv-badge{
  font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;letter-spacing:.02em;
  text-transform:uppercase;
}
.cv-tier-primary{background:rgba(59,130,246,.1);color:#2563eb}
.cv-tier-secondary{background:rgba(99,102,241,.1);color:#4f46e5}
.cv-tier-support{background:#f1f5f9;color:#64748b}
.cv-type{background:#f1f5f9;color:#64748b}
.cv-center{background:rgba(234,179,8,.1);color:#a16207}
.cv-zone-badge{background:rgba(99,102,241,.08);color:#4f46e5}

/* -- detail tabs -- */
.cv-detail-tabs{display:flex;gap:2px;margin-bottom:12px;background:#f1f5f9;border-radius:6px;padding:2px}
.cv-tab-btn{
  border:none;background:transparent;color:#64748b;font-size:11px;font-weight:600;
  padding:5px 10px;border-radius:4px;cursor:pointer;transition:all .15s;
  font-family:inherit;display:flex;align-items:center;gap:4px;
}
.cv-tab-btn:hover{color:#0f172a}
.cv-tab-active{background:#ffffff!important;color:#0f172a!important;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.cv-tab-count{
  font-size:9px;background:rgba(15,23,42,.06);padding:1px 5px;border-radius:3px;
}

/* -- detail body -- */
.cv-detail-body{color:#334155}
.cv-detail-section{margin-bottom:16px}
.cv-detail-section h4{color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;font-weight:600}
.cv-path{
  display:block;font-size:11px;color:#2563eb;background:rgba(59,130,246,.06);
  padding:6px 10px;border-radius:6px;font-family:"SF Mono",Monaco,Consolas,monospace;
}
.cv-hint{font-size:12px;color:#64748b;line-height:1.5}
.cv-desc{font-size:12px;color:#334155;line-height:1.6}
.cv-tags{display:flex;flex-wrap:wrap;gap:4px}
.cv-tag{
  font-size:10px;padding:2px 8px;border-radius:4px;background:#f1f5f9;
  color:#64748b;
}
.cv-conn-item{
  display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:4px;
  cursor:pointer;transition:background .15s;margin-bottom:2px;
}
.cv-conn-item:hover{background:#f8fafc}
.cv-conn-name{color:#0f172a;font-size:12px;font-weight:500}
.cv-conn-rel{color:#94a3b8;font-size:10px}

/* -- couplings tab -- */
.cv-coupling{padding:10px;border-radius:8px;margin-bottom:8px;background:#fafbfc;border:1px solid #e2e8f0}
.cv-coupling-high{border-color:rgba(239,68,68,.3)}
.cv-coupling-medium{border-color:rgba(234,179,8,.3)}
.cv-coupling-pair{display:flex;align-items:center;gap:6px;font-size:13px;color:#0f172a;font-weight:600}
.cv-coupling-arrow{color:#94a3b8;font-size:12px}
.cv-coupling-meta{display:flex;gap:6px;margin-top:4px}
.cv-coupling-str{font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px}
.cv-str-high{color:#dc2626;background:rgba(239,68,68,.08)}
.cv-str-medium{color:#ca8a04;background:rgba(234,179,8,.08)}
.cv-str-low{color:#64748b;background:#f1f5f9}
.cv-coupling-type{font-size:10px;color:#94a3b8}
.cv-coupling-reason{font-size:11px;color:#64748b;margin-top:4px;line-height:1.5}

/* -- impact tab -- */
.cv-blast-badge{
  display:flex;align-items:baseline;gap:4px;padding:10px 14px;border-radius:8px;
  border:1px solid;margin-bottom:10px;
}
.cv-blast-score{font-size:28px;font-weight:800;letter-spacing:-.03em}
.cv-blast-max{font-size:14px;opacity:.5}
.cv-blast-level{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin-left:8px}
.cv-impact-summary{font-size:12px;color:#64748b;line-height:1.5;margin-bottom:12px}
.cv-impact-row{
  padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:4px;
  border:1px solid #e2e8f0;transition:background .15s;
}
.cv-impact-row:hover{background:#f8fafc}
.cv-impact-name{color:#0f172a;font-size:12px;font-weight:600}
.cv-impact-risk{font-size:10px;font-weight:600;margin-left:6px}
.cv-impact-reason{font-size:11px;color:#64748b;line-height:1.4;margin-top:3px}
.cv-impact-via{font-size:10px;color:#7c3aed;font-style:italic;display:block;margin-top:2px}

/* -- flows tab -- */
.cv-flow-card{padding:10px;background:#fafbfc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:8px}
.cv-flow-title{color:#0f172a;font-size:13px;font-weight:600;margin-bottom:6px}
.cv-flow-steps{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.cv-flow-step{color:#334155;font-size:12px}
.cv-flow-arrow{color:#7c3aed;margin:0 4px;font-size:12px}

/* ═══ ZONE NODE ═══ */
.cv-zone{
  background:#ffffff;
  border:1.5px solid #e2e8f0;border-radius:16px;
  padding:18px 24px;min-width:240px;max-width:320px;cursor:pointer;
  transition:all .25s;box-shadow:0 2px 8px rgba(0,0,0,.05);
}
.cv-zone:hover{border-color:#cbd5e1;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.cv-zone-start{border-color:#22c55e!important;box-shadow:0 0 0 3px rgba(34,197,94,.12),0 2px 8px rgba(0,0,0,.05)!important}
.cv-zone-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.cv-zone-icon{font-size:16px;color:#64748b}
.cv-zone-name{color:#0f172a;font-size:15px;font-weight:700;letter-spacing:-.02em;flex:1}
.cv-zone-count{
  font-size:11px;color:#64748b;background:#f1f5f9;
  padding:2px 8px;border-radius:10px;font-weight:600;
}
.cv-zone-desc{color:#64748b;font-size:11px;line-height:1.5;max-height:36px;overflow:hidden}
.cv-zone-bottom{display:flex;gap:8px;margin-top:8px}
.cv-zone-risk{font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px}
.cv-zone-fstep{
  font-size:10px;font-weight:600;color:#7c3aed;
  background:rgba(124,58,237,.08);padding:2px 8px;border-radius:4px;
}

/* ═══ SYSTEM NODE ═══ */
.cv-sys{
  background:#ffffff;border:1.5px solid #e2e8f0;border-left:3px solid #94a3b8;
  border-radius:10px;padding:12px 18px;min-width:160px;max-width:240px;
  cursor:pointer;transition:all .2s;box-shadow:0 1px 4px rgba(0,0,0,.04);
}
.cv-sys:hover{border-color:#cbd5e1;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.cv-sys-selected{border-color:#6366f1!important;box-shadow:0 0 0 3px rgba(99,102,241,.15),0 2px 8px rgba(0,0,0,.06)!important}
.cv-sys-name{color:#0f172a;font-size:13px;font-weight:700;letter-spacing:-.01em}
.cv-sys-meta{display:flex;align-items:center;gap:6px;margin-top:4px}
.cv-sys-type{color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.02em}
.cv-sys-risk{font-size:9px;font-weight:600;padding:1px 6px;border-radius:3px}
.cv-sys-desc{color:#64748b;font-size:10px;margin-top:4px;line-height:1.4;max-height:28px;overflow:hidden}

/* ═══ ADJACENT ZONE NODE ═══ */
.cv-adj-zone{
  background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;
  padding:10px 16px;display:flex;align-items:center;gap:6px;cursor:pointer;
  transition:border-color .2s;min-width:120px;
}
.cv-adj-zone:hover{border-color:#6366f1}
.cv-adj-icon{color:#94a3b8;font-size:14px}
.cv-adj-name{color:#64748b;font-size:12px;font-weight:600}

/* ═══ DIM + IMPACT STATES ═══ */
.cv-dimmed{opacity:.18!important;filter:grayscale(.5);pointer-events:none}
.cv-impact-center{
  border-color:#ef4444!important;
  box-shadow:0 0 0 4px rgba(239,68,68,.15),0 2px 12px rgba(239,68,68,.1)!important;
  animation:cv-ripple 2s ease-out infinite;
}
.cv-impact-direct{
  border-color:#f97316!important;
  box-shadow:0 0 0 3px rgba(249,115,22,.15),0 2px 8px rgba(249,115,22,.08)!important;
}
.cv-impact-indirect{
  border-color:#eab308!important;
  box-shadow:0 0 0 2px rgba(234,179,8,.12)!important;
}
.cv-flow-active{
  border-color:#7c3aed!important;
  box-shadow:0 0 0 3px rgba(124,58,237,.15),0 2px 12px rgba(124,58,237,.08)!important;
}

@keyframes cv-ripple{
  0%{box-shadow:0 0 0 4px rgba(239,68,68,.15),0 2px 12px rgba(239,68,68,.1)}
  50%{box-shadow:0 0 0 8px rgba(239,68,68,.08),0 4px 20px rgba(239,68,68,.06)}
  100%{box-shadow:0 0 0 4px rgba(239,68,68,.15),0 2px 12px rgba(239,68,68,.1)}
}

/* ═══ COMMAND BAR ═══ */
.cmd-backdrop{
  position:fixed;inset:0;background:rgba(15,23,42,.3);z-index:9998;
  backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
}
.cmd-bar{
  position:fixed;top:15%;left:50%;transform:translateX(-50%);
  width:560px;max-width:90vw;background:#ffffff;border:1px solid #e2e8f0;
  border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.15);z-index:9999;
  overflow:hidden;
}
.cmd-input-row{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid #f1f5f9}
.cmd-slash{color:#94a3b8;font-size:16px;font-weight:700;margin-right:10px}
.cmd-input{
  flex:1;background:transparent;border:none;outline:none;color:#0f172a;
  font-size:15px;font-family:inherit;
}
.cmd-input::placeholder{color:#cbd5e1}
.cmd-suggestions{max-height:360px;overflow-y:auto;padding:4px}
.cmd-item{
  display:flex;align-items:center;gap:10px;padding:10px 14px;
  border-radius:8px;cursor:pointer;transition:background .1s;
}
.cmd-item:hover,.cmd-item-active{background:#f8fafc}
.cmd-item-icon{color:#94a3b8;font-size:14px;width:20px;text-align:center}
.cmd-item-text{flex:1;display:flex;flex-direction:column}
.cmd-item-label{color:#0f172a;font-size:13px;font-weight:500}
.cmd-item-sub{color:#94a3b8;font-size:11px}
.cmd-item-type{
  color:#94a3b8;font-size:9px;text-transform:uppercase;font-weight:600;
  letter-spacing:.05em;padding:2px 6px;background:#f1f5f9;border-radius:3px;
}
.cmd-footer{
  display:flex;gap:16px;padding:8px 16px;border-top:1px solid #f1f5f9;
  color:#cbd5e1;font-size:10px;justify-content:center;
}
`;

export function buildAppPage(data: AppData): string {
  const css = appCss();

  const xyflowCssCandidates = [
    path.join(__dirname, "..", "..", "node_modules", "@xyflow", "react", "dist", "style.css"),
    path.join(__dirname, "xyflow-style.css"),
  ];
  let xyflowCss = "";
  for (const candidate of xyflowCssCandidates) {
    try {
      xyflowCss = fs.readFileSync(candidate, "utf-8");
      break;
    } catch {}
  }
  if (!xyflowCss) {
    try {
      const alt = require.resolve("@xyflow/react/dist/style.css");
      xyflowCss = fs.readFileSync(alt, "utf-8");
    } catch {
      console.error("  Warning: could not read @xyflow/react CSS");
    }
  }

  const bundleJs = readBundle("app-bundle.js");
  const dataJson = JSON.stringify(data).replace(/<\//g, "<\\/");
  const a = data.analysis;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Memor \u2014 ${esc(a.repoName)}</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg width='179' height='179' viewBox='0 0 179 179' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23c)'%3E%3Cmask id='a' fill='%23fff'%3E%3Crect x='1' width='179' height='179' rx='6'/%3E%3C/mask%3E%3Crect x='1' width='179' height='179' rx='6' stroke='%23000' stroke-width='20' mask='url(%23a)'/%3E%3Cmask id='b' fill='%23fff'%3E%3Crect x='1' width='135' height='135' rx='6'/%3E%3C/mask%3E%3Crect x='1' width='135' height='135' rx='6' stroke='%23000' stroke-width='20' mask='url(%23b)'/%3E%3Cmask id='d' fill='%23fff'%3E%3Crect x='1' width='94' height='94' rx='6'/%3E%3C/mask%3E%3Crect x='1' width='94' height='94' rx='6' stroke='%23000' stroke-width='20' mask='url(%23d)'/%3E%3Cmask id='e' fill='%23fff'%3E%3Crect x='1' width='54' height='54' rx='6'/%3E%3C/mask%3E%3Crect x='1' width='54' height='54' rx='6' stroke='%23000' stroke-width='20' mask='url(%23e)'/%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='c'%3E%3Crect width='179' height='179' rx='17' fill='%23fff'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E" />
  <style>${xyflowCss}</style>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>window.__MEMOR__=${dataJson};</script>
  <script>${bundleJs}</script>
</body>
</html>`;
}
