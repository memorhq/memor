#!/usr/bin/env node
import * as path from "path";
import * as fs from "fs/promises";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { analyzeRepo } from "./builders/analyzeRepo";
import { generateRepoStory } from "./builders/generateRepoStory";
import { generateRepoFlows } from "./builders/generateRepoFlows";
import { applyNarratives } from "./builders/generateSystemNarrative";
import { generateReadingOrder } from "./builders/generateReadingOrder";
import { detectCouplings } from "./builders/detectCouplings";
import { analyzeChangeImpact } from "./builders/analyzeChangeImpact";
import type { ChangeImpactResult } from "./builders/analyzeChangeImpact";
import type { RepoFlow } from "./builders/generateRepoFlows";
import type { RepoStory } from "./builders/generateRepoStory";
import type { Coupling } from "./builders/detectCouplings";
import type { RepoAnalysis, MemorSystem } from "./types";

// ── State ─────────────────────────────────────────────────────────────

let analysis: RepoAnalysis;
let story: RepoStory;
let flows: RepoFlow[];
let couplings: Coupling[];
let impactResults: Record<string, ChangeImpactResult>;

// ── Helpers ───────────────────────────────────────────────────────────

function findSystem(query: string): MemorSystem | undefined {
  const q = query.toLowerCase().trim();
  return (
    analysis.systems.find((s) => s.id === q) ||
    analysis.systems.find((s) => s.name.toLowerCase() === q) ||
    analysis.systems.find((s) => s.name.toLowerCase().includes(q))
  );
}

function fmt(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

function errorResult(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const repoPath = path.resolve(process.argv[2] || ".");

  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(`Error: not a directory: ${repoPath}`);
    process.exit(1);
  }

  // Run analysis
  const result = await analyzeRepo(repoPath);
  analysis = result.analysis;

  applyNarratives(analysis.systems, analysis.repoName);

  story = generateRepoStory(analysis);
  flows = generateRepoFlows(analysis, story);
  story.flows = flows.slice(0, 4).map((f) => ({
    id: f.id,
    title: f.title,
    type: f.type,
    confidence: f.confidence,
    isMain: f.isMain,
    steps: f.steps.map((s) => ({
      label: s.label,
      description: s.description,
      whyItMatters: s.whyItMatters,
      systemName: s.systemName,
      zoneName: s.zoneName,
    })),
  }));

  const readingOrder = generateReadingOrder(analysis, story);
  story.readingOrder = readingOrder.steps;

  couplings = detectCouplings(analysis, story);
  story.keyCouplings = couplings.slice(0, 8).map((c) => ({
    from: c.sourceName,
    to: c.targetName,
    type: c.type,
    strength: c.strength,
    reason: c.reason,
  }));

  impactResults = {};
  for (const sys of analysis.systems) {
    const r = analyzeChangeImpact(sys.id, analysis, story, couplings, flows);
    if (r) impactResults[sys.id] = r;
  }

  // ── MCP Server ──────────────────────────────────────────────────────

  const server = new McpServer(
    { name: "memor", version: "0.1.0" },
    { capabilities: { logging: {} } }
  );

  // ── Tools ───────────────────────────────────────────────────────────

  server.registerTool(
    "get_architecture",
    {
      title: "Get Architecture Overview",
      description:
        "Returns the high-level architecture of the analyzed codebase: repo name, mode, narrative, system count, zones, and key couplings.",
    },
    async () => {
      const zones = story.zones.map((z) => ({
        name: z.name,
        systems: z.systemIds.length,
        description: z.description,
      }));

      const overview = {
        repoName: analysis.repoName,
        repoMode: analysis.repoMode,
        narrative: analysis.repoNarrative,
        totalSystems: analysis.systems.length,
        primarySystems: analysis.systems.filter((s) => s.systemTier === "primary").length,
        secondarySystems: analysis.systems.filter((s) => s.systemTier === "secondary").length,
        supportSystems: analysis.systems.filter((s) => s.systemTier === "support").length,
        zones,
        keyCouplings: story.keyCouplings,
        detectedFrameworks: analysis.summary.detectedFrameworks,
        repoStyle: analysis.summary.detectedRepoStyle,
      };

      return text(fmt(overview));
    }
  );

  server.registerTool(
    "list_systems",
    {
      title: "List All Systems",
      description:
        "Returns a summary list of all detected systems in the codebase with name, type, tier, role hint, and description.",
    },
    async () => {
      const systems = analysis.systems.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        tier: s.systemTier,
        roleHint: s.systemRoleHint || s.inferredSupportRole || undefined,
        description: s.description,
        tech: s.detectedTech,
        entryPoint: s.recommendedStartPath,
        isCenter: s.isRepoCenter || false,
      }));

      return text(fmt(systems));
    }
  );

  server.registerTool(
    "get_system_detail",
    {
      title: "Get System Detail",
      description:
        "Returns detailed information about a specific system including connections, entry points, blocks, internal structure, and detected tech. Pass a system name or ID.",
      inputSchema: {
        system: z.string().describe("System name or ID to look up"),
      },
    },
    async ({ system }) => {
      const sys = findSystem(system as string);
      if (!sys) return errorResult(`System not found: "${system}". Use list_systems to see available systems.`);

      const detail = {
        id: sys.id,
        name: sys.name,
        type: sys.type,
        tier: sys.systemTier,
        runtimeRole: sys.runtimeRole,
        description: sys.description,
        roleHint: sys.systemRoleHint || sys.inferredSupportRole,
        isCenter: sys.isRepoCenter || false,
        rootPath: sys.rootPath,
        entryPoint: sys.recommendedStartPath,
        startPathReason: sys.startPathReason,
        detectedTech: sys.detectedTech,
        connections: sys.connections,
        blocks: sys.blocks.map((b) => ({
          name: b.name,
          type: b.type,
          path: b.path,
        })),
        subsystems: sys.subsystems?.map((sub) => ({
          name: sub.name,
          kind: sub.kind,
          path: sub.path,
          description: sub.description,
        })),
        internalZones: sys.internalStructure?.zones.map((z) => ({
          label: z.label,
          kind: z.kind,
          fileCount: z.fileCount,
        })),
      };

      return text(fmt(detail));
    }
  );

  server.registerTool(
    "get_impact",
    {
      title: "Get Change Impact",
      description:
        "Analyzes what happens if you change a specific system. Returns blast radius, direct/indirect impacts, risk levels, and recommendations. Pass a system name or ID.",
      inputSchema: {
        system: z.string().describe("System name or ID to analyze impact for"),
      },
    },
    async ({ system }) => {
      const sys = findSystem(system as string);
      if (!sys) return errorResult(`System not found: "${system}". Use list_systems to see available systems.`);

      const impact = impactResults[sys.id];
      if (!impact) return text(`No significant downstream impact detected for "${sys.name}". This system is relatively isolated.`);

      const result = {
        system: impact.selectedSystem,
        summary: impact.summary,
        blastRadius: {
          score: impact.blastRadiusScore,
          level: impact.blastRadiusLevel,
          confidence: impact.confidence,
        },
        directImpacts: impact.directImpacts.map((d) => ({
          system: d.systemName,
          zone: d.zoneName,
          risk: d.risk,
          type: d.impactType,
          reason: d.reason,
        })),
        indirectImpacts: impact.indirectImpacts.map((i) => ({
          system: i.systemName,
          zone: i.zoneName,
          risk: i.risk,
          type: i.impactType,
          via: i.via,
          reason: i.reason,
        })),
      };

      return text(fmt(result));
    }
  );

  server.registerTool(
    "get_flows",
    {
      title: "Get Runtime Flows",
      description:
        "Returns the detected runtime flows showing how the system actually works at runtime — request pipelines, rendering cycles, data flows, etc.",
    },
    async () => {
      if (flows.length === 0) return text("No runtime flows detected for this codebase.");

      const result = flows.map((f) => ({
        title: f.title,
        type: f.type,
        confidence: f.confidence,
        isMain: f.isMain || false,
        steps: f.steps.map((s) => ({
          label: s.label,
          system: s.systemName,
          zone: s.zoneName,
          description: s.description,
          whyItMatters: s.whyItMatters,
        })),
      }));

      return text(fmt(result));
    }
  );

  server.registerTool(
    "get_zones",
    {
      title: "Get Architectural Zones",
      description:
        "Returns the architectural zones — logical groupings of systems by responsibility area (e.g., 'Core Runtime', 'API Layer', 'Testing & Fixtures').",
    },
    async () => {
      const zones = story.zones.map((z) => {
        const systemDetails = z.systemIds
          .map((id) => analysis.systems.find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => ({
            name: s!.name,
            type: s!.type,
            tier: s!.systemTier,
          }));

        return {
          name: z.name,
          description: z.description,
          systems: systemDetails,
        };
      });

      return text(fmt(zones));
    }
  );

  server.registerTool(
    "search_systems",
    {
      title: "Search Systems",
      description:
        "Search for systems by keyword across names, types, descriptions, and tech stacks. Returns matching systems with relevance context.",
      inputSchema: {
        query: z.string().describe("Search keyword"),
      },
    },
    async ({ query }) => {
      const q = (query as string).toLowerCase();
      const matches = analysis.systems
        .map((s) => {
          let score = 0;
          if (s.name.toLowerCase().includes(q)) score += 10;
          if (s.type.toLowerCase().includes(q)) score += 5;
          if (s.description.toLowerCase().includes(q)) score += 3;
          if (s.detectedTech?.some((t) => t.toLowerCase().includes(q))) score += 4;
          if (s.rootPath.toLowerCase().includes(q)) score += 2;
          const role = (s.systemRoleHint || s.inferredSupportRole || "").toLowerCase();
          if (role.includes(q)) score += 4;
          return { system: s, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((m) => ({
          name: m.system.name,
          type: m.system.type,
          tier: m.system.systemTier,
          description: m.system.description,
          path: m.system.rootPath,
        }));

      if (matches.length === 0) return text(`No systems match "${query}".`);
      return text(fmt(matches));
    }
  );

  server.registerTool(
    "get_reading_order",
    {
      title: "Get Recommended Reading Order",
      description:
        "Returns the recommended order for reading through the codebase to understand its architecture progressively.",
    },
    async () => {
      if (!story.readingOrder || story.readingOrder.length === 0)
        return text("No reading order generated for this codebase.");

      return text(fmt(story.readingOrder));
    }
  );

  server.registerTool(
    "get_couplings",
    {
      title: "Get System Couplings",
      description:
        "Returns detected coupling relationships between systems, ranked by strength. Shows which systems are tightly interconnected and why.",
    },
    async () => {
      if (couplings.length === 0) return text("No significant couplings detected.");

      const result = couplings.slice(0, 15).map((c) => ({
        from: c.sourceName,
        to: c.targetName,
        type: c.type,
        strength: c.strength,
        reason: c.reason,
      }));

      return text(fmt(result));
    }
  );

  // ── Resources ─────────────────────────────────────────────────────

  server.registerResource(
    "analysis-summary",
    "memor://analysis",
    {
      title: "Full Analysis Summary",
      description: "Complete analysis data for the codebase",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: fmt({
            repoName: analysis.repoName,
            repoMode: analysis.repoMode,
            narrative: analysis.repoNarrative,
            systemCount: analysis.systems.length,
            frameworks: analysis.summary.detectedFrameworks,
            style: analysis.summary.detectedRepoStyle,
            zones: story.zones.map((z) => z.name),
            flowCount: flows.length,
          }),
        },
      ],
    })
  );

  // ── Prompts ───────────────────────────────────────────────────────

  server.registerPrompt(
    "understand-codebase",
    {
      title: "Understand This Codebase",
      description: "Generate a comprehensive understanding prompt for the analyzed codebase",
    },
    () => {
      const zoneList = story.zones.map((z) => `- ${z.name}: ${z.description}`).join("\n");
      const systemList = analysis.systems
        .filter((s) => s.systemTier === "primary")
        .map((s) => `- ${s.name} (${s.type}): ${s.description}`)
        .join("\n");
      const flowList = flows
        .slice(0, 3)
        .map((f) => `- ${f.title}: ${f.steps.map((s) => s.label).join(" → ")}`)
        .join("\n");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I'm working with the ${analysis.repoName} codebase. Here's what Memor's analysis found:

**Architecture**: ${analysis.repoMode} (${analysis.summary.detectedRepoStyle})
**Narrative**: ${analysis.repoNarrative}

**Zones**:
${zoneList}

**Primary Systems**:
${systemList}

**Key Runtime Flows**:
${flowList}

Based on this architecture, help me understand how this codebase works and where I should focus.`,
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "plan-change",
    {
      title: "Plan a Change",
      description: "Generate an impact-aware change planning prompt for a specific system",
      argsSchema: {
        system: z.string().describe("Name of the system you want to change"),
      },
    },
    ({ system }) => {
      const sys = findSystem(system as string);
      const impact = sys ? impactResults[sys.id] : undefined;

      let impactContext = "No impact data available.";
      if (impact) {
        const highRisk = impact.directImpacts.filter((d) => d.risk === "high");
        impactContext = `**Blast Radius**: ${impact.blastRadiusLevel} (score: ${impact.blastRadiusScore}/100)
**Summary**: ${impact.summary}
**High-risk dependencies**: ${highRisk.length > 0 ? highRisk.map((d) => `${d.systemName} (${d.reason})`).join(", ") : "None"}
**All affected systems**: ${[...impact.directImpacts, ...impact.indirectImpacts].map((d) => d.systemName).join(", ")}`;
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to make changes to the **${sys?.name || system}** system in ${analysis.repoName}.

**System Info**: ${sys?.description || "Unknown system"}
**Type**: ${sys?.type || "unknown"} | **Tier**: ${sys?.systemTier || "unknown"}

**Impact Analysis**:
${impactContext}

Help me plan this change safely. What should I watch out for? What tests should I run? What systems might break?`,
            },
          },
        ],
      };
    }
  );

  // ── Connect ────────────────────────────────────────────────────────

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
