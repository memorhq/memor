import type { ConnectionRelation, MemorSystem, RepoAnalysis, SystemConnection, SystemTier } from "../types";
import { formatSummaryNarrative } from "../builders/buildSummary";
import { buildRepoStructureBullets } from "../builders/buildRepoStructureBullets";

function bullet(lines: string[]): string {
  return lines.map((l) => `- ${l}`).join("\n");
}

function tierSectionTitle(tier: SystemTier): string {
  const m: Record<SystemTier, string> = {
    primary: "Primary systems",
    secondary: "Secondary systems",
    support: "Support systems",
  };
  return m[tier];
}

function confidenceEmoji(c?: "high" | "medium" | "fallback"): string {
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

function startPathMarkdown(sys: MemorSystem): string | null {
  if (!sys.recommendedStartPath) return null;
  const label = sys.runtimeRole === "runnable" ? "Start here" : "Consumed from";
  const lines = [`**${label}:** \`${sys.recommendedStartPath}\``];
  if (sys.startPathReason) {
    lines.push(`> _Why:_ ${sys.startPathReason}`);
    const ql = qualityLabel(sys.startPathQuality);
    lines.push(`> _Confidence:_ ${confidenceEmoji(sys.startPathConfidence)}${ql ? ` · _Quality:_ ${ql}` : ""}`);
  }
  return lines.join("\n");
}

function renderSubsystemsMarkdown(parent: MemorSystem): string {
  if (!parent.subsystems?.length) return "";
  const out: string[] = [];
  out.push("#### Subsystems");
  out.push("");
  for (const sub of parent.subsystems) {
    out.push(
      `- **${sub.name}** (\`${sub.kind}\`) — \`${sub.path}\` — ${sub.description} _(confidence ${(sub.confidence * 100).toFixed(0)}%)_`
    );
    if (sub.recommendedStartPath) {
      const label =
        parent.runtimeRole === "runnable"
          ? "Start here"
          : parent.runtimeRole === "consumable"
            ? "Consumed from"
            : "Entry";
      out.push(`  - **${label}:** \`${sub.recommendedStartPath}\``);
    }
  }
  out.push("");
  return out.join("\n");
}

const RELATION_LABELS: Record<ConnectionRelation, string> = {
  uses: "Uses",
  "used-by": "Used by",
  extends: "Extends",
  bridges: "Bridges",
};

const RELATION_ORDER: ConnectionRelation[] = ["uses", "extends", "bridges", "used-by"];

function renderConnectionsMarkdown(sys: MemorSystem): string {
  if (!sys.connections) return "";
  const { outgoing, incoming } = sys.connections;
  if (outgoing.length === 0 && incoming.length === 0) return "";

  const lines: string[] = [];
  lines.push("#### How this connects");
  lines.push("");

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

  for (const rel of RELATION_ORDER) {
    const conns = grouped.get(rel);
    if (!conns || conns.length === 0) continue;
    lines.push(`**${RELATION_LABELS[rel]}:**`);
    const shown = conns.slice(0, 5);
    for (const c of shown) {
      lines.push(
        `- ${c.targetSystemName} — ${c.reason} (${(c.confidence * 100).toFixed(0)}%)`
      );
    }
    if (conns.length > 5) {
      lines.push(`- _…and ${conns.length - 5} more_`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderSystemMarkdown(sys: MemorSystem): string {
  const lines: string[] = [];
  lines.push(`### ${sys.name}`);
  lines.push("");
  const meta = [
    `Type: **${sys.type}** (confidence ${(sys.confidence * 100).toFixed(0)}%)`,
    `Tier: **${sys.systemTier}**`,
    `Runtime role: **${sys.runtimeRole}**`,
    `Importance: **${sys.importanceScore.toFixed(2)}** (0–1)`,
    `Path: \`${sys.rootPath}\``,
  ];
  if (sys.packageArchetype && sys.packageArchetype !== "unknown") {
    meta.push(`Archetype: **${sys.packageArchetype}**`);
  }
  if (
    sys.appArchetype &&
    sys.appArchetype !== "unknown" &&
    sys.type === "web-app" &&
    sys.runtimeRole === "runnable"
  ) {
    meta.push(`App archetype: **${sys.appArchetype}**`);
  }
  if (sys.systemRoleHint && sys.systemRoleHint !== "unknown") {
    meta.push(`Role hint: **${sys.systemRoleHint}**`);
  }
  if (sys.isRepoCenter) {
    meta.push(`Repo center: **yes**`);
  }
  if (sys.inferredSupportRole && !sys.isRepoCenter) {
    const showRole =
      !sys.packageArchetype ||
      sys.packageArchetype === "unknown" ||
      sys.systemTier !== "primary";
    if (showRole) {
      meta.push(`Likely role: **${sys.inferredSupportRole}**`);
    }
  }
  meta.push(`Description: ${sys.description}`);
  lines.push(bullet(meta));
  lines.push("");
  const sp = startPathMarkdown(sys);
  if (sp) {
    lines.push(sp);
    lines.push("");
  }

  lines.push("#### Entry Points");
  lines.push("");
  if (sys.entryPoints.length === 0) {
    lines.push("_No confident entry files matched heuristics._");
  } else {
    for (const ep of sys.entryPoints) {
      lines.push(
        `- \`${ep.path}\` — _${ep.kind}_ (${(ep.confidence * 100).toFixed(0)}%): ${ep.reason}`
      );
    }
  }
  lines.push("");

  lines.push("#### Core Blocks");
  lines.push("");
  if (sys.blocks.length === 0) {
    lines.push("_No labeled blocks; tree may be flat or unconventional._");
  } else {
    for (const b of sys.blocks) {
      const why = b.reason ? ` — ${b.reason}` : "";
      lines.push(`- **${b.name}** (\`${b.type}\`) → \`${b.path}\`${why}`);
    }
  }
  lines.push("");

  lines.push(renderSubsystemsMarkdown(sys));

  const connMd = renderConnectionsMarkdown(sys);
  if (connMd) {
    lines.push(connMd);
  }

  lines.push("#### Flow Skeletons");
  lines.push("");
  for (const flow of sys.flows) {
    lines.push(
      `**${flow.name}** — ${flow.description} _(confidence ${(flow.confidence * 100).toFixed(0)}%)_`
    );
    lines.push("");
    let i = 1;
    for (const step of flow.steps) {
      const p = step.path ? ` \`${step.path}\`` : "";
      lines.push(`${i}. ${step.label} _(${step.type})_${p}`);
      i += 1;
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Calm, skimmable markdown briefing (no dashboard chrome).
 */
export function renderMarkdownReport(
  analysis: RepoAnalysis,
  deprioritizedPaths: string[]
): string {
  const { repoName, rootPath, systems, ignoredPaths, summary } = analysis;

  const lines: string[] = [];

  lines.push(`# Memor Report: ${repoName}`);
  lines.push("");

  if (analysis.repoMode && analysis.repoMode !== "unknown") {
    lines.push("## Repository Overview");
    lines.push("");
    lines.push(`- Mode: **${analysis.repoMode}**`);
    lines.push(`- Center: ${analysis.repoCenter}`);
    lines.push("");
    lines.push(analysis.repoNarrative);
    lines.push("");

    const structBullets = buildRepoStructureBullets(analysis);
    if (structBullets.length) {
      lines.push("**How this repo is shaped:**");
      lines.push("");
      lines.push(bullet(structBullets));
      lines.push("");
    }
  }

  lines.push("## Repository Summary");
  lines.push("");
  lines.push(bullet([
    `Root path: \`${rootPath}\``,
    `Repo style: **${summary.detectedRepoStyle}**`,
    `Frameworks / signals: ${summary.detectedFrameworks.length ? summary.detectedFrameworks.join(", ") : "_(none detected)_"}`,
    `Systems detected: **${summary.totalSystems}**`,
    `Files scanned (approx.): ${summary.totalFiles} files, ${summary.totalDirectories} directories`,
  ]));
  lines.push("");
  lines.push(formatSummaryNarrative(summary, systems));
  lines.push("");
  lines.push(
    "_Systems are grouped by tier (primary → secondary → support). Within each group they are ordered by likely developer relevance (importance), then confidence, then name._"
  );
  lines.push("");

  let prevTier: SystemTier | null = null;
  for (const sys of systems) {
    if (sys.systemTier !== prevTier) {
      prevTier = sys.systemTier;
      lines.push(`## ${tierSectionTitle(prevTier)}`);
      lines.push("");
    }
    lines.push(renderSystemMarkdown(sys));
  }

  lines.push("## Ignored Paths (not descended)");
  lines.push("");
  if (ignoredPaths.length === 0) {
    lines.push("_None — or nothing matched the noise list._");
  } else {
    lines.push(bullet(ignoredPaths.map((p) => `\`${p}\``)));
  }
  lines.push("");

  lines.push("## De-prioritized Paths (scanned, lower emphasis)");
  lines.push("");
  if (deprioritizedPaths.length === 0) {
    lines.push("_None._");
  } else {
    lines.push(bullet(deprioritizedPaths.map((p) => `\`${p}\``)));
  }
  lines.push("");

  lines.push(
    `---\n_Generated by Memor V0 at ${new Date().toISOString()}_`
  );

  return lines.join("\n");
}
