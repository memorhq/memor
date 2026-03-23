import type { ConnectionRelation, MemorSystem, RepoAnalysis, SystemConnection, SystemTier } from "../types";
import { formatSummaryNarrative } from "../builders/buildSummary";
import { buildRepoStructureBullets } from "../builders/buildRepoStructureBullets";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tierSectionTitle(tier: SystemTier): string {
  const m: Record<SystemTier, string> = {
    primary: "Primary systems",
    secondary: "Secondary systems",
    support: "Support systems",
  };
  return m[tier];
}

function confidenceLabel(c?: "high" | "medium" | "fallback"): string {
  if (c === "high") return "High confidence";
  if (c === "medium") return "Likely good starting point";
  return "Fallback starting point";
}

function qualityLabel(q?: string): string {
  if (q === "strong-runtime-entry") return "Strong runtime entry";
  if (q === "source-anchor") return "Source anchor";
  if (q === "metadata-fallback") return "Metadata fallback";
  return "";
}

function startPathHtml(sys: MemorSystem): string {
  if (!sys.recommendedStartPath) return "";
  const label = sys.runtimeRole === "runnable" ? "Start here" : "Consumed from";
  const ql = qualityLabel(sys.startPathQuality);
  const explanation = sys.startPathReason
    ? `<p class="muted" style="margin:0.15rem 0 0 1rem"><em>Why:</em> ${esc(sys.startPathReason)}<br/><em>Confidence:</em> ${esc(confidenceLabel(sys.startPathConfidence))}${ql ? ` · <em>Quality:</em> ${esc(ql)}` : ""}</p>`
    : "";
  return `<p><strong>${esc(label)}:</strong> <span class="path">${esc(sys.recommendedStartPath)}</span></p>${explanation}`;
}

function renderSubsystemsHtml(parent: MemorSystem): string {
  if (!parent.subsystems?.length) return "";
  const items = parent.subsystems
    .map((sub) => {
      const label =
        parent.runtimeRole === "runnable"
          ? "Start here"
          : parent.runtimeRole === "consumable"
            ? "Consumed from"
            : "Entry";
      const start = sub.recommendedStartPath
        ? `<p class="muted"><strong>${esc(label)}:</strong> <span class="path">${esc(sub.recommendedStartPath)}</span></p>`
        : "";
      return `<li><strong>${esc(sub.name)}</strong> (<code>${esc(sub.kind)}</code>) — <span class="path">${esc(sub.path)}</span><br/><span class="muted">${esc(sub.description)} — confidence ${(sub.confidence * 100).toFixed(0)}%</span>${start}</li>`;
    })
    .join("");
  return `<h4>Subsystems</h4><ul>${items}</ul>`;
}

const RELATION_LABELS: Record<ConnectionRelation, string> = {
  uses: "Uses",
  "used-by": "Used by",
  extends: "Extends",
  bridges: "Bridges",
};

const RELATION_ORDER: ConnectionRelation[] = ["uses", "extends", "bridges", "used-by"];

function renderConnectionsHtml(sys: MemorSystem): string {
  if (!sys.connections) return "";
  const { outgoing, incoming } = sys.connections;
  if (outgoing.length === 0 && incoming.length === 0) return "";

  const grouped = new Map<ConnectionRelation, SystemConnection[]>();
  for (const c of outgoing) {
    const arr = grouped.get(c.relation) || [];
    arr.push(c);
    grouped.set(c.relation, arr);
  }
  for (const c of incoming) {
    const arr = grouped.get("used-by") || [];
    arr.push(c);
    grouped.set("used-by", arr);
  }

  const parts: string[] = [];
  parts.push("<h4>How this connects</h4>");

  for (const rel of RELATION_ORDER) {
    const conns = grouped.get(rel);
    if (!conns || conns.length === 0) continue;
    parts.push(`<p><strong>${esc(RELATION_LABELS[rel])}:</strong></p>`);
    const shown = conns.slice(0, 5);
    const items = shown
      .map(
        (c) =>
          `<li>${esc(c.targetSystemName)} — ${esc(c.reason)} (${(c.confidence * 100).toFixed(0)}%)</li>`
      )
      .join("");
    const more =
      conns.length > 5
        ? `<li class="muted">…and ${conns.length - 5} more</li>`
        : "";
    parts.push(`<ul>${items}${more}</ul>`);
  }

  return parts.join("\n");
}

function renderSystemSection(sys: MemorSystem): string {
  const eps =
    sys.entryPoints.length === 0
      ? "<p class=\"muted\">No high-confidence entry files matched.</p>"
      : `<ul>${sys.entryPoints
          .map(
            (ep) =>
              `<li><span class="path">${esc(ep.path)}</span> — <em>${esc(ep.kind)}</em> (${(ep.confidence * 100).toFixed(0)}%): ${esc(ep.reason)}</li>`
          )
          .join("")}</ul>`;

  const blocks =
    sys.blocks.length === 0
      ? "<p class=\"muted\">No architectural blocks labeled.</p>"
      : `<ul>${sys.blocks
          .map(
            (b) =>
              `<li><strong>${esc(b.name)}</strong> (<code>${esc(b.type)}</code>) → <span class="path">${esc(b.path)}</span>${b.reason ? ` — ${esc(b.reason)}` : ""}</li>`
          )
          .join("")}</ul>`;

  const flows = sys.flows
    .map((flow) => {
      const steps = flow.steps
        .map(
          (st) =>
            `<li>${esc(st.label)} <span class="muted">(${esc(st.type)})</span>${st.path ? ` <span class="path">${esc(st.path)}</span>` : ""}</li>`
        )
        .join("");
      return `<h4>${esc(flow.name)}</h4><p class="muted">${esc(flow.description)} — confidence ${(flow.confidence * 100).toFixed(0)}%</p><ol>${steps}</ol>`;
    })
    .join("");

  const start = startPathHtml(sys);

  const archetypeLine =
    sys.packageArchetype && sys.packageArchetype !== "unknown"
      ? `<p><strong>Archetype:</strong> <code>${esc(sys.packageArchetype)}</code></p>`
      : "";

  const appArchetypeLine =
    sys.appArchetype &&
    sys.appArchetype !== "unknown" &&
    sys.type === "web-app" &&
    sys.runtimeRole === "runnable"
      ? `<p><strong>App archetype:</strong> <code>${esc(sys.appArchetype)}</code></p>`
      : "";

  const roleHintLine =
    sys.systemRoleHint && sys.systemRoleHint !== "unknown"
      ? `<p><strong>Role hint:</strong> <code>${esc(sys.systemRoleHint)}</code>${sys.isRepoCenter ? " · <strong>Repo center</strong>" : ""}</p>`
      : sys.isRepoCenter
        ? `<p><strong>Repo center</strong></p>`
        : "";

  const showSupportRole =
    sys.inferredSupportRole &&
    !sys.isRepoCenter &&
    (!sys.packageArchetype || sys.packageArchetype === "unknown" || sys.systemTier !== "primary");

  const supportRoleLine = showSupportRole
    ? `<p><strong>Likely role:</strong> <code>${esc(sys.inferredSupportRole!)}</code></p>`
    : "";

  const subs = renderSubsystemsHtml(sys);
  const connsHtml = renderConnectionsHtml(sys);

  return `
    <section id="${esc(sys.id)}">
      <h3>${esc(sys.name)}</h3>
      <p><strong>Type:</strong> <code>${esc(sys.type)}</code> · <strong>Confidence:</strong> ${(sys.confidence * 100).toFixed(0)}% · <strong>Tier:</strong> ${esc(sys.systemTier)} · <strong>Runtime role:</strong> ${esc(sys.runtimeRole)} · <strong>Importance:</strong> ${esc(sys.importanceScore.toFixed(2))}</p>
      ${archetypeLine}
      ${appArchetypeLine}
      ${roleHintLine}
      ${supportRoleLine}
      <p><strong>Root:</strong> <span class="path">${esc(sys.rootPath)}</span></p>
      ${start}
      <p>${esc(sys.description)}</p>
      <h4>Entry points</h4>
      ${eps}
      <h4>Core blocks</h4>
      ${blocks}
      ${subs}
      ${connsHtml}
      <h4>Flow skeletons</h4>
      ${flows}
    </section>
  `;
}

/**
 * Minimal wiki-style HTML — typography-first, no JavaScript.
 */
export function renderHtmlReport(
  analysis: RepoAnalysis,
  deprioritizedPaths: string[]
): string {
  const { repoName, rootPath, systems, ignoredPaths, summary } = analysis;
  const generated = new Date().toISOString();
  const narrative = formatSummaryNarrative(summary, systems);

  const css = `
    :root { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; }
    body { max-width: 52rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; background: #fff; }
    h1 { font-size: 1.75rem; font-weight: normal; border-bottom: 1px solid #ccc; padding-bottom: 0.35rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; font-weight: normal; border-bottom: 1px solid #e0e0e0; }
    h2.tier-group { margin-top: 2.25rem; }
    h3 { font-size: 1.1rem; margin-top: 1.5rem; }
    h4 { font-size: 0.95rem; margin-top: 1rem; color: #444; }
    .summary-box { border: 1px solid #d8d8d8; padding: 1rem 1.15rem; background: #fafafa; margin: 1rem 0 2rem; }
    .summary-box p { margin: 0.5rem 0 0; }
    ul { padding-left: 1.25rem; }
    li { margin: 0.25rem 0; }
    code, .path { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; font-size: 0.88em; background: #f4f4f4; padding: 0.1em 0.35em; border: 1px solid #e8e8e8; }
    table { width: 100%; border-collapse: collapse; font-size: 0.95rem; margin: 0.75rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }
    th { background: #f7f7f7; font-weight: normal; }
    .muted { color: #666; font-size: 0.9rem; }
    .toc { margin: 1rem 0 2rem; }
    hr.footer { border: none; border-top: 1px solid #e0e0e0; margin: 2.5rem 0 1rem; }
  `;

  const tocRows = systems
    .map(
      (s) =>
        `<tr><td><a href="#${esc(s.id)}">${esc(s.name)}</a></td><td>${esc(s.systemTier)}</td><td>${esc(s.runtimeRole)}</td><td>${esc(s.importanceScore.toFixed(2))}</td><td><code>${esc(s.type)}</code></td><td class="path">${esc(s.rootPath)}</td></tr>`
    )
    .join("\n");

  const sectionParts: string[] = [];
  let prevTier: SystemTier | null = null;
  for (const sys of systems) {
    if (sys.systemTier !== prevTier) {
      prevTier = sys.systemTier;
      sectionParts.push(
        `<h2 class="tier-group">${esc(tierSectionTitle(prevTier))}</h2>`
      );
    }
    sectionParts.push(renderSystemSection(sys));
  }
  const systemSections = sectionParts.join("\n");

  const ignoredList =
    ignoredPaths.length === 0
      ? "<p class=\"muted\">None recorded.</p>"
      : `<ul>${ignoredPaths.map((p) => `<li class="path">${esc(p)}</li>`).join("")}</ul>`;

  const deprioList =
    deprioritizedPaths.length === 0
      ? "<p class=\"muted\">None.</p>"
      : `<ul>${deprioritizedPaths.map((p) => `<li class="path">${esc(p)}</li>`).join("")}</ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Memor — ${esc(repoName)}</title>
  <style>${css}</style>
</head>
<body>
  <h1>Memor report: ${esc(repoName)}</h1>
  <p class="muted">Architecture-first briefing · systems before files</p>

  ${
    analysis.repoMode && analysis.repoMode !== "unknown"
      ? (() => {
          const structBullets = buildRepoStructureBullets(analysis);
          const structHtml = structBullets.length
            ? `<p style="margin-top:0.75rem"><strong>How this repo is shaped:</strong></p><ul>${structBullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
            : "";
          return `<div class="summary-box">
    <strong>Repository overview</strong>
    <ul>
      <li>Mode: <strong>${esc(analysis.repoMode)}</strong></li>
      <li>Center: ${esc(analysis.repoCenter)}</li>
    </ul>
    <p>${esc(analysis.repoNarrative)}</p>
    ${structHtml}
  </div>`;
        })()
      : ""
  }

  <div class="summary-box">
    <strong>Repository summary</strong>
    <ul>
      <li>Root: <span class="path">${esc(rootPath)}</span></li>
      <li>Style: <strong>${esc(summary.detectedRepoStyle)}</strong></li>
      <li>Frameworks: ${esc(summary.detectedFrameworks.join(", ") || "—")}</li>
      <li>Systems: <strong>${summary.totalSystems}</strong> · Files ~${summary.totalFiles} · Directories ~${summary.totalDirectories}</li>
    </ul>
    <p>${esc(narrative)}</p>
    <p class="muted">Systems are grouped by tier, then ordered by likely developer relevance (importance), confidence, and name.</p>
  </div>

  <h2>Systems</h2>
  <table class="toc">
    <thead><tr><th>System</th><th>Tier</th><th>Role</th><th>Importance</th><th>Type</th><th>Path</th></tr></thead>
    <tbody>${tocRows || `<tr><td colspan="6" class="muted">No systems</td></tr>`}</tbody>
  </table>

  ${systemSections}

  <h2>Ignored paths</h2>
  <p class="muted">Directories not descended into (noise / generated).</p>
  ${ignoredList}

  <h2>De-prioritized paths</h2>
  <p class="muted">Still scanned, but flagged as lower-signal for orientation (tests, CI, etc.).</p>
  ${deprioList}

  <hr class="footer" />
  <p class="muted">Memor V0 · generated ${esc(generated)}</p>
</body>
</html>`;
}
