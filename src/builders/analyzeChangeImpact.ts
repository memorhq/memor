import type { MemorSystem, RepoAnalysis } from "../types";
import type { Coupling } from "./detectCouplings";
import type { RepoStory } from "./generateRepoStory";
import type { RepoFlow } from "./generateRepoFlows";

// ── Public types ─────────────────────────────────────────────────────

export type ImpactType = "runtime" | "build" | "api" | "integration" | "tooling";
export type RiskLevel = "high" | "medium" | "low";

export type DirectImpact = {
  systemId: string;
  systemName: string;
  zoneName: string;
  reason: string;
  risk: RiskLevel;
  impactType: ImpactType;
};

export type IndirectImpact = {
  systemId: string;
  systemName: string;
  zoneName: string;
  via: string[];
  reason: string;
  risk: RiskLevel;
  impactType: ImpactType;
};

export type ChangeImpactResult = {
  selectedSystem: string;
  selectedSystemId: string;
  summary: string;
  directImpacts: DirectImpact[];
  indirectImpacts: IndirectImpact[];
  blastRadiusScore: number;
  blastRadiusLevel: "local" | "contained" | "broad" | "architectural";
  confidence: "high" | "medium" | "low";
};

// ── Main analyzer ────────────────────────────────────────────────────

export function analyzeChangeImpact(
  systemId: string,
  analysis: RepoAnalysis,
  story: RepoStory,
  couplings: Coupling[],
  flows?: RepoFlow[]
): ChangeImpactResult | null {
  const { systems } = analysis;
  const selected = systems.find((s) => s.id === systemId);
  if (!selected) return null;

  const sysMap = new Map(systems.map((s) => [s.id, s]));

  // Zone lookup
  const zoneOf = new Map<string, string>();
  for (const zone of story.zones) {
    for (const sid of zone.systemIds) zoneOf.set(sid, zone.name);
  }
  const rn = analysis.repoName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const primaryCenterId = systems.find(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === rn
  )?.id;

  // Flow participation index: how critical is each system across runtime flows
  const flowProfile = buildFlowProfile(selected.name, systems, flows);

  // ── Direct impacts: systems with edges to/from the selected system ──

  const directIds = new Set<string>();
  const directImpacts: DirectImpact[] = [];

  // Systems that directly depend on the selected system (incoming edges = they use us)
  if (selected.connections?.incoming) {
    for (const conn of selected.connections.incoming) {
      const dep = sysMap.get(conn.targetSystemId);
      if (!dep || dep.id === selected.id) continue;
      if (directIds.has(dep.id)) continue;
      directIds.add(dep.id);

      const impactType = classifyImpactType(selected, dep, conn.relation, zoneOf);
      const risk = assessDirectRisk(selected, dep, conn, couplings, flowProfile);
      directImpacts.push({
        systemId: dep.id,
        systemName: dep.name,
        zoneName: zoneOf.get(dep.id) || "Other",
        reason: generateDirectReason(selected, dep, conn.relation, impactType, flowProfile),
        risk,
        impactType,
      });
    }
  }

  // Systems the selected system directly depends on (outgoing edges = we use them)
  if (selected.connections?.outgoing) {
    for (const conn of selected.connections.outgoing) {
      const dep = sysMap.get(conn.targetSystemId);
      if (!dep || dep.id === selected.id) continue;
      if (directIds.has(dep.id)) continue;
      directIds.add(dep.id);

      const impactType = classifyImpactType(selected, dep, conn.relation, zoneOf);
      let risk: RiskLevel = conn.relation === "extends" ? "medium" : "low";
      if (flowProfile.onCriticalPath && dep.systemTier === "primary") risk = "medium";
      directImpacts.push({
        systemId: dep.id,
        systemName: dep.name,
        zoneName: zoneOf.get(dep.id) || "Other",
        reason: generateOutgoingReason(selected, dep, conn.relation),
        risk,
        impactType,
      });
    }
  }

  // Also add systems with high-strength couplings not already captured
  for (const c of couplings) {
    const otherId =
      c.sourceId === selected.id ? c.targetId :
      c.targetId === selected.id ? c.sourceId : null;
    if (!otherId || directIds.has(otherId)) continue;
    if (c.strength !== "high") continue;

    const dep = sysMap.get(otherId);
    if (!dep) continue;
    directIds.add(dep.id);
    directImpacts.push({
      systemId: dep.id,
      systemName: dep.name,
      zoneName: zoneOf.get(dep.id) || "Other",
      reason: `Strongly coupled: ${c.reason}`,
      risk: "medium",
      impactType: c.type as ImpactType,
    });
  }

  // Sort direct impacts: high → medium → low
  const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
  directImpacts.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  // ── Indirect impacts: 2-hop dependencies ───────────────────────────

  const indirectIds = new Set<string>();
  const indirectImpacts: IndirectImpact[] = [];

  for (const directSys of directImpacts) {
    const intermediate = sysMap.get(directSys.systemId);
    if (!intermediate?.connections?.incoming) continue;

    for (const conn of intermediate.connections.incoming) {
      const hop2 = sysMap.get(conn.targetSystemId);
      if (!hop2) continue;
      if (hop2.id === selected.id) continue;
      if (directIds.has(hop2.id)) continue;
      if (indirectIds.has(hop2.id)) continue;
      indirectIds.add(hop2.id);

      const impactType = classifyImpactType(intermediate, hop2, conn.relation, zoneOf);
      const risk = assessIndirectRisk(hop2, intermediate, selected, couplings);

      indirectImpacts.push({
        systemId: hop2.id,
        systemName: hop2.name,
        zoneName: zoneOf.get(hop2.id) || "Other",
        via: [intermediate.name],
        reason: generateIndirectReason(hop2, intermediate, selected),
        risk,
        impactType,
      });
    }
  }

  indirectImpacts.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  // ── Blast radius score ─────────────────────────────────────────────

  let score = 0;
  for (const d of directImpacts) {
    if (d.risk === "high") score += 12;
    else if (d.risk === "medium") score += 7;
    else score += 3;
  }
  for (const i of indirectImpacts) {
    if (i.risk === "high" || i.risk === "medium") score += 5;
    else score += 2;
  }

  // Zone spread bonus
  const impactedZones = new Set<string>();
  for (const d of directImpacts) impactedZones.add(d.zoneName);
  for (const i of indirectImpacts) impactedZones.add(i.zoneName);
  score += impactedZones.size * 3;

  // Flow participation bonus: systems on critical runtime paths have wider blast radius
  if (flowProfile.onCriticalPath) score += 8;
  else if (flowProfile.flowCount > 0) score += flowProfile.flowCount * 2;

  score = Math.min(score, 100);

  const blastRadiusLevel =
    score <= 20 ? "local" :
    score <= 45 ? "contained" :
    score <= 70 ? "broad" : "architectural";

  // ── Zone-level fallback for single-package repos ──────────────────
  // When there are no system-level connections, show internal zone dependencies
  // so the Impact view isn't completely empty for standalone apps/libraries.

  const totalConnections =
    (selected.connections?.incoming?.length || 0) +
    (selected.connections?.outgoing?.length || 0);

  if (directImpacts.length === 0 && indirectImpacts.length === 0 && totalConnections === 0) {
    const zones = selected.internalStructure?.zones ?? [];
    const zoneDeps = selected.internalStructure?.dependencies ?? [];
    if (zones.length >= 2 && zoneDeps.length > 0) {
      // Group deps by target zone — zones with many incoming deps are high-impact
      const targetCounts = new Map<string, number>();
      for (const dep of zoneDeps) {
        targetCounts.set(dep.targetZoneId, (targetCounts.get(dep.targetZoneId) || 0) + dep.importCount);
      }

      for (const dep of zoneDeps.slice(0, 6)) {
        const srcZone = zones.find((z) => z.id === dep.sourceZoneId);
        const tgtZone = zones.find((z) => z.id === dep.targetZoneId);
        if (!srcZone || !tgtZone) continue;

        const totalIncoming = targetCounts.get(dep.targetZoneId) || 1;
        const risk: RiskLevel = totalIncoming >= 10 ? "high" : totalIncoming >= 4 ? "medium" : "low";

        directImpacts.push({
          systemId: selected.id,
          systemName: `${selected.name} › ${srcZone.label}`,
          zoneName: tgtZone.label,
          reason: `${srcZone.label} imports from ${tgtZone.label} (${dep.importCount} import${dep.importCount !== 1 ? "s" : ""}) — changes to ${tgtZone.label} may require updates here.`,
          risk,
          impactType: "runtime",
        });
      }
    }
  }

  // ── Confidence ─────────────────────────────────────────────────────

  const confidence: "high" | "medium" | "low" =
    totalConnections >= 6 ? "high" :
    totalConnections >= 2 ? "medium" : "low";

  // ── Summary ────────────────────────────────────────────────────────

  const summary = generateSummary(
    selected, directImpacts, indirectImpacts, blastRadiusLevel, impactedZones, systems
  );

  return {
    selectedSystem: selected.name,
    selectedSystemId: selected.id,
    summary,
    directImpacts: directImpacts.slice(0, 10),
    indirectImpacts: indirectImpacts.slice(0, 10),
    blastRadiusScore: score,
    blastRadiusLevel,
    confidence,
  };
}

// ── Impact type classification ───────────────────────────────────────

function classifyImpactType(
  a: MemorSystem,
  b: MemorSystem,
  relation: string,
  zoneOf: Map<string, string>
): ImpactType {
  if (relation === "extends") return "integration";

  const zones = [zoneOf.get(a.id) || "", zoneOf.get(b.id) || ""].map(z => z.toLowerCase());
  if (zones.some((z) => /compiler|build|tooling|bundl/i.test(z))) return "build";
  if (zones.some((z) => /devtools|testing|test|fixture|example|playground/i.test(z)))
    return "tooling";
  if (zones.some((z) => /integration|adapter|deploy|plugin|extension/i.test(z)))
    return "integration";

  const names = [a.name.toLowerCase(), b.name.toLowerCase()];
  if (names.some((n) => /compiler|babel|transform|bundl|webpack|vite|esbuild|rollup/i.test(n))) return "build";
  if (names.some((n) => /devtools|test|fixture|example|mock|stub|spec/i.test(n))) return "tooling";
  if (names.some((n) => /adapter|integration|plugin|extension|connector/i.test(n))) return "integration";

  if (names.some((n) => /api|gateway|controller|route|endpoint|graphql|rest/i.test(n))) return "api";
  if (a.isRepoCenter || b.isRepoCenter) return "api";
  return "runtime";
}

// ── Risk assessment ──────────────────────────────────────────────────

function assessDirectRisk(
  selected: MemorSystem,
  affected: MemorSystem,
  conn: { relation: string; reason: string; confidence: number },
  couplings: Coupling[],
  flowProfile?: FlowProfile
): RiskLevel {
  const coupling = couplings.find(
    (c) =>
      (c.sourceId === selected.id && c.targetId === affected.id) ||
      (c.targetId === selected.id && c.sourceId === affected.id)
  );
  if (coupling?.strength === "high") return "high";

  const affectedName = affected.name.toLowerCase();

  if (affected.systemTier === "primary" && isCoreRuntime(affectedName, affected))
    return "high";

  if (conn.relation === "extends") return "high";
  if (conn.relation === "used-by" && /also a direct/i.test(conn.reason)) return "high";

  // Flow-aware boost: if the selected system sits on a critical runtime path,
  // its direct dependents inherit elevated risk
  if (flowProfile?.onCriticalPath && affected.systemTier === "primary") return "high";

  if (/multiple.*import/i.test(conn.reason)) return "medium";

  // Flow participation as a medium-risk signal
  if (flowProfile && flowProfile.flowCount >= 2 && affected.systemTier !== "support")
    return "medium";

  if (/test|fixture|example|benchmark|mock|stub/i.test(affectedName)) return "low";
  if (affected.systemTier === "support") return "low";

  return "medium";
}

function isCoreRuntime(name: string, sys: MemorSystem): boolean {
  const hint = (sys.systemRoleHint || "").toLowerCase();
  if (/core|engine|kernel|runtime|foundation/i.test(hint)) return true;
  return /core|engine|runtime|server|client|renderer|router|database|auth|store|middleware|api|gateway|controller|service/i.test(name);
}

function assessIndirectRisk(
  hop2: MemorSystem,
  via: MemorSystem,
  selected: MemorSystem,
  couplings: Coupling[]
): RiskLevel {
  // If the intermediate has a high coupling with selected, indirect risk bumps up
  const coupling = couplings.find(
    (c) =>
      (c.sourceId === selected.id && c.targetId === via.id) ||
      (c.targetId === selected.id && c.sourceId === via.id)
  );
  if (coupling?.strength === "high" && via.systemTier === "primary") return "medium";

  if (/test|fixture|example|benchmark/i.test(hop2.name)) return "low";
  if (hop2.systemTier === "primary") return "medium";
  return "low";
}

// ── Reason generation ────────────────────────────────────────────────

function generateDirectReason(
  selected: MemorSystem,
  affected: MemorSystem,
  relation: string,
  impactType: ImpactType,
  flowProfile?: FlowProfile
): string {
  const sn = selected.name;
  const an = affected.name;
  const n = affected.name.toLowerCase();

  const flowSuffix = flowProfile?.onCriticalPath
    ? ` On the critical path for ${flowProfile.flowNames[0]}.`
    : flowProfile && flowProfile.flowCount >= 2
      ? ` Appears in ${flowProfile.flowCount} runtime flows.`
      : "";

  const affectedBlocks = describeBlocks(affected);
  const selectedBlocks = describeBlocks(selected);

  if (relation === "extends" || relation === "used-by") {
    if (/test|spec|fixture/i.test(n))
      return `${an} tests ${sn} — test cases may need revision.`;
    if (/devtools|debug|inspector/i.test(n))
      return `${an} inspects ${sn} internals — instrumentation hooks may need updates.`;

    const changeShape = describeChangeShape(selected);
    const consumeShape = describeConsumeShape(affected);

    if (changeShape && consumeShape)
      return `${an} (${consumeShape}) imports from ${sn} (${changeShape}) — ${consumeShape} may need updates.${flowSuffix}`;
    if (changeShape)
      return `${an} depends on ${sn}'s ${changeShape} — may need updates if that contract changes.${flowSuffix}`;
    if (consumeShape)
      return `${an} (${consumeShape}) imports ${sn} — ${consumeShape} updates are likely.${flowSuffix}`;

    return `${an} depends on ${sn} — changes to exports or types may require updates in ${an}.${flowSuffix}`;
  }

  if (relation === "uses") {
    const depShape = describeChangeShape(affected);
    if (depShape)
      return `${sn} consumes ${an}'s ${depShape} — usage patterns may need adjustment.${flowSuffix}`;
    return `${sn} imports from ${an} — may need adjustment if ${an}'s API changes.${flowSuffix}`;
  }

  if (affectedBlocks)
    return `${an} (${affectedBlocks}) is connected to ${sn} — may be affected.${flowSuffix}`;
  return `${an} is connected to ${sn} — changes may propagate.${flowSuffix}`;
}

function describeRole(sys: MemorSystem): string {
  const n = sys.name.toLowerCase();
  const hint = (sys.systemRoleHint || "").toLowerCase();
  if (/renderer|render/i.test(n)) return "rendering layer";
  if (/router|routing/i.test(n)) return "routing layer";
  if (/auth/i.test(n)) return "authentication";
  if (/database|db|orm|prisma|typeorm/i.test(n)) return "data layer";
  if (/api|gateway|controller/i.test(n)) return "API layer";
  if (/middleware/i.test(n)) return "middleware";
  if (/store|state|redux/i.test(n)) return "state management";
  if (/server|ssr/i.test(n)) return "server layer";
  if (/shared|common|util/i.test(n)) return "shared utilities";
  if (/core|engine/i.test(hint)) return "core module";
  return "";
}

function describeBlocks(sys: MemorSystem): string {
  const meaningful = sys.blocks
    ?.filter((b) => !/tests|mocks|config|scripts|static-assets|generated-code|constants|type-definitions|templates|docs|examples|unknown|database-migrations|localization/.test(b.type))
    .map((b) => {
      const labels: Record<string, string> = {
        routes: "routes", "ui-components": "UI components", features: "feature modules",
        state: "state", "api-layer": "API surface", services: "services",
        database: "data access", integrations: "integrations", schemas: "schemas",
        "server-code": "server logic", "client-code": "client code", hooks: "hooks",
        adapters: "adapters", providers: "providers", operators: "operators",
        workflows: "workflows", tasks: "tasks", plugins: "plugins",
        transport: "transport", orchestration: "orchestration", sdks: "SDKs",
        cli: "CLI", "library-code": "library code",
      };
      return labels[b.type] || null;
    })
    .filter((l): l is string => !!l);
  if (!meaningful || meaningful.length === 0) return "";
  const unique = [...new Set(meaningful)];
  return unique.slice(0, 2).join(" and ");
}

function describeChangeShape(sys: MemorSystem): string {
  const blocks = sys.blocks?.map((b) => b.type) || [];
  const n = sys.name.toLowerCase();
  const tech = sys.detectedTech?.filter((t) => !/^(TypeScript|JavaScript)$/i.test(t)) || [];

  if (blocks.includes("routes") || /route|controller|endpoint/i.test(n)) {
    const framework = tech.find((t) => /express|nest|fastify|koa|hono/i.test(t));
    return framework ? `${framework} routes` : "route contract";
  }
  if (blocks.includes("schemas") || /schema|type|contract/i.test(n)) return "shared types";
  if (blocks.includes("api-layer") || /api|gateway/i.test(n)) return "API surface";
  if (blocks.includes("state") || /store|state|redux/i.test(n)) return "state contract";
  if (blocks.includes("services") || /service|middleware/i.test(n)) {
    const framework = tech.find((t) => /express|nest|fastify/i.test(t));
    return framework ? `${framework} services` : "service layer";
  }
  if (blocks.includes("ui-components") || /component|ui/i.test(n)) {
    const framework = tech.find((t) => /react|vue|svelte|angular/i.test(t));
    return framework ? `${framework} components` : "UI components";
  }
  if (blocks.includes("hooks")) return "hooks";
  if (blocks.includes("database") || /db|database|prisma|orm/i.test(n)) {
    const orm = tech.find((t) => /prisma|typeorm|drizzle|knex/i.test(t));
    return orm ? `${orm} data layer` : "database access layer";
  }
  if (blocks.includes("providers")) return "providers";
  if (blocks.includes("adapters") || blocks.includes("integrations")) return "integration adapters";
  if (blocks.includes("library-code")) return "library exports";
  return "";
}

function describeConsumeShape(sys: MemorSystem): string {
  const blocks = sys.blocks?.map((b) => b.type) || [];
  const n = sys.name.toLowerCase();
  if (blocks.includes("routes") || /route|controller/i.test(n)) return "routes";
  if (blocks.includes("ui-components")) return "UI components";
  if (blocks.includes("services") || /service/i.test(n)) return "services";
  if (blocks.includes("hooks")) return "hooks";
  if (blocks.includes("state")) return "state management";
  if (blocks.includes("api-layer")) return "API layer";
  return "";
}

function generateOutgoingReason(
  selected: MemorSystem,
  dep: MemorSystem,
  relation: string
): string {
  const sn = selected.name;
  const dn = dep.name;

  if (relation === "extends")
    return `${sn} extends ${dn} — changes to ${sn} may require ${dn}'s API to adapt.`;

  const depShape = describeChangeShape(dep);
  if (depShape)
    return `${sn} imports ${dn}'s ${depShape} — may need adjustment if that contract changes.`;

  const role = describeRole(dep);
  if (role)
    return `${sn} depends on ${dn} (${role}) — interaction pattern may need updates.`;
  return `${sn} imports from ${dn} — may need adjustment if ${dn}'s exports change.`;
}

function generateIndirectReason(
  hop2: MemorSystem,
  via: MemorSystem,
  selected: MemorSystem
): string {
  const viaShape = describeChangeShape(via);
  const hop2Shape = describeConsumeShape(hop2);
  if (viaShape && hop2Shape)
    return `${hop2.name} (${hop2Shape}) uses ${via.name} (${viaShape}), which depends on ${selected.name}. Changes may propagate.`;
  if (viaShape)
    return `Reaches ${hop2.name} through ${via.name}'s ${viaShape}, which depends on ${selected.name}.`;
  return `${hop2.name} uses ${via.name}, which depends on ${selected.name}. Changes may propagate.`;
}

// ── Flow participation profiling ─────────────────────────────────────

type FlowProfile = {
  flowCount: number;
  flowNames: string[];
  onCriticalPath: boolean;
  earliestStepPosition: number;
};

function buildFlowProfile(
  systemName: string,
  systems: MemorSystem[],
  flows?: RepoFlow[]
): FlowProfile {
  const empty: FlowProfile = { flowCount: 0, flowNames: [], onCriticalPath: false, earliestStepPosition: Infinity };
  if (!flows || flows.length === 0) return empty;

  const nameLC = systemName.toLowerCase();
  const matchingFlows: string[] = [];
  let earliest = Infinity;
  let onMain = false;

  for (const flow of flows) {
    let foundInThisFlow = false;
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepSysLC = (step.systemName || "").toLowerCase();
      const stepLabelLC = step.label.toLowerCase();
      if (stepSysLC === nameLC || stepLabelLC.includes(nameLC)) {
        if (!foundInThisFlow) {
          matchingFlows.push(flow.title);
          foundInThisFlow = true;
        }
        if (i < earliest) earliest = i;
        if (flow.isMain) onMain = true;
      }
    }
  }

  return {
    flowCount: matchingFlows.length,
    flowNames: matchingFlows,
    onCriticalPath: onMain && earliest <= 2,
    earliestStepPosition: earliest === Infinity ? -1 : earliest,
  };
}

// ── Summary generation ───────────────────────────────────────────────

function generateSummary(
  selected: MemorSystem,
  direct: DirectImpact[],
  indirect: IndirectImpact[],
  level: string,
  zones: Set<string>,
  allSystems: MemorSystem[]
): string {
  const highCount = direct.filter((d) => d.risk === "high").length;
  const highNames = direct.filter((d) => d.risk === "high").slice(0, 2).map((d) => d.systemName);
  const zoneCount = zones.size;
  const name = selected.name;
  const shape = describeChangeShape(selected);
  const shapeNote = shape ? ` (${shape})` : "";

  // Self-contained system: no connections at all
  const isSelfContained =
    direct.length === 0 && indirect.length === 0 &&
    (selected.connections?.incoming?.length || 0) === 0 &&
    (selected.connections?.outgoing?.length || 0) === 0;

  if (isSelfContained) {
    const internalZones = selected.internalStructure?.zones ?? [];
    const zoneNames = internalZones
      .filter((z) => z.kind !== "support" && z.kind !== "config")
      .slice(0, 3)
      .map((z) => z.label);
    if (zoneNames.length > 0) {
      return `${name} is a self-contained system — no cross-system connections detected. Changes within ${zoneNames.join(", ")} zones stay local to this codebase.`;
    }
    return `${name} is a self-contained system with no detected dependencies on other systems. Use the Structure view to explore internal zones.`;
  }

  if (level === "local") {
    return `Changes to ${name}${shapeNote} have limited reach — ${direct.length} connected system${direct.length !== 1 ? "s" : ""}.`;
  }
  if (level === "contained") {
    const highNote = highNames.length > 0 ? ` High-risk: ${highNames.join(", ")}.` : "";
    return `${name}${shapeNote} affects ${direct.length} direct and ${indirect.length} indirect systems across ${zoneCount} zone${zoneCount !== 1 ? "s" : ""}.${highNote}`;
  }
  if (level === "broad") {
    const highNote = highNames.length > 0 ? ` Most critical: ${highNames.join(", ")}.` : "";
    return `${name}${shapeNote} has broad impact — ${direct.length + indirect.length} systems across ${zoneCount} zones.${highNote}`;
  }
  const highNote = highNames.length > 0 ? ` Most critical: ${highNames.join(", ")}.` : "";
  return `${name}${shapeNote} is architecturally central — changes ripple to ${direct.length + indirect.length} systems across ${zoneCount} zones.${highNote}`;
}
