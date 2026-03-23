import * as path from "path";
import type {
  ConnectionRelation,
  FlatScanEntry,
  MemorSystem,
  RepoMode,
  SystemConnection,
  SystemConnections,
} from "../types";
import { readTextSafe } from "../utils/file";
import { parseJsonLoose } from "../utils/text";

// ── Internal edge representation ──────────────────────────────────────

type RawEdge = {
  sourceId: string;
  targetId: string;
  relation: ConnectionRelation;
  confidence: number;
  reason: string;
};

// ── 1. Package.json dependency extraction ─────────────────────────────

async function extractPkgDeps(
  system: MemorSystem,
  repoRoot: string
): Promise<Map<string, string>> {
  const deps = new Map<string, string>();
  const sysRoot =
    system.rootPath === "."
      ? repoRoot
      : path.join(repoRoot, ...system.rootPath.split("/"));

  const pkgPath = path.join(sysRoot, "package.json");
  const raw = await readTextSafe(pkgPath);
  if (!raw) return deps;

  const pkg = parseJsonLoose(raw);
  if (!pkg) return deps;

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
  ] as const) {
    const section = pkg[field];
    if (section && typeof section === "object" && !Array.isArray(section)) {
      for (const name of Object.keys(section as Record<string, unknown>)) {
        const existing = deps.get(name);
        // peerDependencies is the strongest signal for relation type
        if (!existing || field === "peerDependencies") {
          deps.set(name, field);
        }
      }
    }
  }
  return deps;
}

function readPkgName(
  system: MemorSystem,
  repoRoot: string
): Promise<string | null> {
  const sysRoot =
    system.rootPath === "."
      ? repoRoot
      : path.join(repoRoot, ...system.rootPath.split("/"));
  const pkgPath = path.join(sysRoot, "package.json");
  return readTextSafe(pkgPath).then((raw) => {
    if (!raw) return null;
    const pkg = parseJsonLoose(raw);
    return pkg && typeof pkg.name === "string" ? pkg.name : null;
  });
}

async function buildPkgNameIndex(
  systems: MemorSystem[],
  repoRoot: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  await Promise.all(
    systems.map(async (s) => {
      const name = await readPkgName(s, repoRoot);
      if (name) map.set(name, s.id);
    })
  );
  return map;
}

async function pkgDependencyEdges(
  systems: MemorSystem[],
  repoRoot: string,
  pkgNameToId: Map<string, string>
): Promise<RawEdge[]> {
  const edges: RawEdge[] = [];
  await Promise.all(
    systems.map(async (source) => {
      const deps = await extractPkgDeps(source, repoRoot);
      for (const [depName, depField] of deps) {
        const targetId = pkgNameToId.get(depName);
        if (targetId && targetId !== source.id) {
          const isPeer = depField === "peerDependencies";
          edges.push({
            sourceId: source.id,
            targetId,
            relation: isPeer ? "extends" : "uses",
            confidence: 0.90,
            reason: isPeer
              ? "peer dependency — plugin/extension relationship"
              : "package dependency detected",
          });
        }
      }
    })
  );
  return edges;
}

// ── 2. Cross-system import scanning ───────────────────────────────────

const IMPORT_RE =
  /(?:^|\n)\s*(?:import\s|export\s.*\sfrom\s|require\s*\()['"]([^'"]+)['"]/g;

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    specifiers.push(m[1]);
  }
  return specifiers;
}

function systemFiles(
  system: MemorSystem,
  flat: FlatScanEntry[],
  repoRoot: string
): FlatScanEntry[] {
  const sysRoot =
    system.rootPath === "."
      ? repoRoot
      : path.join(repoRoot, ...system.rootPath.split("/"));
  const norm = path.normalize(sysRoot);
  const SCANNABLE = new Set([
    "ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs",
  ]);
  return flat.filter(
    (e) =>
      !e.isDirectory &&
      SCANNABLE.has(e.extension) &&
      path.normalize(e.fullPath).startsWith(norm + path.sep)
  );
}

const MAX_SOURCE_FILES_PER_SYSTEM = 120;
const MAX_FILE_SIZE = 128 * 1024;

async function crossSystemImportEdges(
  systems: MemorSystem[],
  flat: FlatScanEntry[],
  repoRoot: string,
  pkgNameToId: Map<string, string>
): Promise<RawEdge[]> {
  const edges: RawEdge[] = [];

  // Build path-prefix → system id mapping for relative-path detection
  const pathPrefixToId = new Map<string, string>();
  for (const s of systems) {
    if (s.rootPath !== ".") {
      pathPrefixToId.set(s.rootPath, s.id);
    }
  }

  for (const source of systems) {
    const files = systemFiles(source, flat, repoRoot);
    const sampled =
      files.length > MAX_SOURCE_FILES_PER_SYSTEM
        ? files.slice(0, MAX_SOURCE_FILES_PER_SYSTEM)
        : files;

    const hitCount = new Map<string, number>();

    for (const file of sampled) {
      const content = await readTextSafe(file.fullPath, MAX_FILE_SIZE);
      if (!content) continue;

      const specifiers = extractImportSpecifiers(content);
      for (const spec of specifiers) {
        // Match against known package names (bare specifiers)
        const bare = spec.startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        const targetByPkg = pkgNameToId.get(bare);
        if (targetByPkg && targetByPkg !== source.id) {
          hitCount.set(targetByPkg, (hitCount.get(targetByPkg) || 0) + 1);
          continue;
        }

        // Match against relative paths that cross system boundaries
        if (spec.startsWith(".")) {
          const resolved = path
            .resolve(path.dirname(file.fullPath), spec)
            .replace(/\\/g, "/");
          const relFromRepo = path
            .relative(repoRoot, resolved)
            .replace(/\\/g, "/");

          for (const [prefix, sysId] of pathPrefixToId) {
            if (
              sysId !== source.id &&
              (relFromRepo.startsWith(prefix + "/") || relFromRepo === prefix)
            ) {
              hitCount.set(sysId, (hitCount.get(sysId) || 0) + 1);
              break;
            }
          }
        }
      }
    }

    for (const [targetId, count] of hitCount) {
      if (count >= 1) {
        const conf = count >= 5 ? 0.85 : count >= 2 ? 0.65 : 0.50;
        const reason =
          count >= 5
            ? "multiple cross-system imports detected"
            : count >= 2
              ? "cross-system imports detected"
              : "single cross-system import detected";
        edges.push({
          sourceId: source.id,
          targetId,
          relation: "uses",
          confidence: conf,
          reason,
        });
      }
    }
  }
  return edges;
}

// ── 3. Role-hint-based structural edges ───────────────────────────────

function roleHintEdges(
  systems: MemorSystem[],
  repoMode: RepoMode
): RawEdge[] {
  const edges: RawEdge[] = [];
  const centers = systems.filter((s) => s.isRepoCenter);
  if (centers.length === 0) return edges;

  for (const sys of systems) {
    if (sys.isRepoCenter) continue;

    const hint = sys.systemRoleHint;
    const sr = sys.inferredSupportRole;

    // Framework adapters extend core
    if (hint === "framework-adapter-package") {
      for (const c of centers) {
        if (
          c.systemRoleHint === "framework-core-package" ||
          c.isRepoCenter
        ) {
          edges.push({
            sourceId: sys.id,
            targetId: c.id,
            relation: "extends",
            confidence: 0.70,
            reason: "adapter package targets framework core",
          });
        }
      }
    }

    // Renderer bindings bridge core to a runtime
    if (sr === "renderer-binding") {
      for (const c of centers) {
        edges.push({
          sourceId: sys.id,
          targetId: c.id,
          relation: "bridges",
          confidence: 0.65,
          reason: "renderer binding connects core to host environment",
        });
      }
    }

    // Adapter/bridge support role
    if (sr === "adapter-bridge") {
      for (const c of centers) {
        edges.push({
          sourceId: sys.id,
          targetId: c.id,
          relation: "bridges",
          confidence: 0.60,
          reason: "adapter bridges core to external runtime or protocol",
        });
      }
    }

    // Workflow providers extend core
    if (
      hint === "workflow-provider-package" &&
      repoMode === "workflow-platform"
    ) {
      for (const c of centers) {
        edges.push({
          sourceId: sys.id,
          targetId: c.id,
          relation: "extends",
          confidence: 0.65,
          reason: "provider package extends workflow core",
        });
      }
    }
  }
  return edges;
}

// ── 4. Edge deduplication + merging ───────────────────────────────────

function deduplicateEdges(raw: RawEdge[]): RawEdge[] {
  const key = (e: RawEdge) =>
    `${e.sourceId}→${e.targetId}→${e.relation}`;
  const best = new Map<string, RawEdge>();

  for (const e of raw) {
    const k = key(e);
    const existing = best.get(k);
    if (!existing || e.confidence > existing.confidence) {
      best.set(k, e);
    }
  }

  // Promote relation: if same source→target has both "uses" and "extends",
  // keep "extends" (more specific) and drop "uses"
  const pairKey = (e: RawEdge) => `${e.sourceId}→${e.targetId}`;
  const byPair = new Map<string, RawEdge[]>();
  for (const e of best.values()) {
    const pk = pairKey(e);
    const arr = byPair.get(pk) || [];
    arr.push(e);
    byPair.set(pk, arr);
  }

  const result: RawEdge[] = [];
  for (const group of byPair.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const hasSpecific = group.some(
      (e) => e.relation === "extends" || e.relation === "bridges"
    );
    if (hasSpecific) {
      // Keep only the most specific relation, take highest confidence
      const specific = group.filter(
        (e) => e.relation === "extends" || e.relation === "bridges"
      );
      const best = specific.reduce((a, b) =>
        b.confidence > a.confidence ? b : a
      );
      // Boost confidence when multiple evidence sources agree
      const usesEvidence = group.find((e) => e.relation === "uses");
      if (usesEvidence) {
        best.confidence = Math.min(
          0.95,
          Math.max(best.confidence, usesEvidence.confidence) + 0.05
        );
        best.reason += " (also a direct dependency)";
      }
      result.push(best);
    } else {
      result.push(
        group.reduce((a, b) => (b.confidence > a.confidence ? b : a))
      );
    }
  }
  return result;
}

// ── 5. Build final per-system connections ─────────────────────────────

function buildConnectionMaps(
  edges: RawEdge[],
  systems: MemorSystem[]
): Map<string, SystemConnections> {
  const idToName = new Map<string, string>();
  for (const s of systems) idToName.set(s.id, s.name);

  const map = new Map<string, SystemConnections>();
  for (const s of systems) {
    map.set(s.id, { outgoing: [], incoming: [] });
  }

  const sortConns = (arr: SystemConnection[]) =>
    arr.sort((a, b) => b.confidence - a.confidence || a.targetSystemName.localeCompare(b.targetSystemName));

  for (const e of edges) {
    if (e.confidence < 0.45) continue;

    const targetName = idToName.get(e.targetId);
    const sourceName = idToName.get(e.sourceId);
    if (!targetName || !sourceName) continue;

    const outConn: SystemConnection = {
      targetSystemId: e.targetId,
      targetSystemName: targetName,
      relation: e.relation,
      confidence: Math.round(e.confidence * 100) / 100,
      reason: e.reason,
    };
    map.get(e.sourceId)!.outgoing.push(outConn);

    const inverseRelation: ConnectionRelation =
      e.relation === "uses"
        ? "used-by"
        : e.relation === "extends"
          ? "used-by"
          : e.relation === "bridges"
            ? "used-by"
            : "used-by";
    const inConn: SystemConnection = {
      targetSystemId: e.sourceId,
      targetSystemName: sourceName,
      relation: inverseRelation,
      confidence: outConn.confidence,
      reason: e.reason,
    };
    map.get(e.targetId)!.incoming.push(inConn);
  }

  for (const conns of map.values()) {
    sortConns(conns.outgoing);
    sortConns(conns.incoming);
    conns.outgoing = conns.outgoing.slice(0, 10);
    conns.incoming = conns.incoming.slice(0, 10);
  }

  return map;
}

// ── Public API ────────────────────────────────────────────────────────

export async function buildSystemConnections(
  systems: MemorSystem[],
  repoRoot: string,
  flat: FlatScanEntry[],
  repoMode: RepoMode
): Promise<void> {
  if (systems.length < 2) return;

  const pkgNameToId = await buildPkgNameIndex(systems, repoRoot);

  const [pkgEdges, importEdges] = await Promise.all([
    pkgDependencyEdges(systems, repoRoot, pkgNameToId),
    crossSystemImportEdges(systems, flat, repoRoot, pkgNameToId),
  ]);

  const hintEdges = roleHintEdges(systems, repoMode);

  const allEdges = [...pkgEdges, ...importEdges, ...hintEdges];
  const deduped = deduplicateEdges(allEdges);

  const connectionMap = buildConnectionMaps(deduped, systems);

  for (const s of systems) {
    const conns = connectionMap.get(s.id);
    if (conns && (conns.outgoing.length > 0 || conns.incoming.length > 0)) {
      s.connections = conns;
    }
  }
}
