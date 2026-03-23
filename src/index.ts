#!/usr/bin/env node
import * as fs from "fs/promises";
import * as path from "path";
import { analyzeRepo } from "./builders/analyzeRepo";
import { renderHtmlReport } from "./renderer/renderHtmlReport";
import { renderMarkdownReport } from "./renderer/renderMarkdownReport";
import { buildConnectionGraphView } from "./viewBuilders/buildConnectionGraphView";
import { buildSystemFocusView } from "./viewBuilders/buildSystemFocusView";
import { renderConnectionGraphHtml } from "./renderer/renderConnectionGraph";
import { renderSystemFocusHtml } from "./renderer/renderSystemFocusView";
import { pathExists } from "./utils/file";
import { normalizeRepoRoot } from "./utils/path";
import { slugify } from "./utils/text";

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length < 1) {
    console.error("Usage: memor <absolute-or-relative-repo-path>");
    console.error("Example: npm run analyze -- /path/to/repo");
    console.error(
      "Paths with spaces: quote the path, e.g. npm run analyze -- \"/Users/me/My Projects/repo\""
    );
    process.exit(1);
  }

  const joined = args.join(" ").trim();
  const tryPaths = [joined, args[0]].filter((p, i, a) => p && a.indexOf(p) === i);
  let repoPath = "";
  for (const candidate of tryPaths) {
    const resolved = normalizeRepoRoot(candidate);
    if (await pathExists(resolved)) {
      repoPath = resolved;
      break;
    }
  }

  if (!repoPath) {
    console.error(
      `Error: path does not exist or is not accessible. Tried: ${tryPaths.join(" | ")}`
    );
    console.error(
      "Hint: quote paths that contain spaces, and run `npm run analyze` from the memor-v0 package directory."
    );
    process.exit(1);
  }

  const stat = await fs.stat(repoPath).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(`Error: not a directory: ${repoPath}`);
    process.exit(1);
  }

  const packageRoot = path.resolve(__dirname, "..");
  const outDir =
    process.env.MEMOR_OUTPUT_DIR?.trim() ||
    path.join(packageRoot, "output");
  await fs.mkdir(outDir, { recursive: true });

  console.error(`Memor: analyzing ${repoPath} …`);

  let result: Awaited<ReturnType<typeof analyzeRepo>>;
  try {
    result = await analyzeRepo(repoPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Error during analysis: ${msg}`);
    process.exit(1);
  }

  const { analysis, deprioritizedPaths } = result;
  const repoSlug = slugify(analysis.repoName) || "repo";
  const jsonPath = path.join(outDir, `${repoSlug}-repo-analysis.json`);
  const htmlPath = path.join(outDir, `${repoSlug}-memor-report.html`);
  const mdPath = path.join(outDir, `${repoSlug}-memor-report.md`);

  const graphView = buildConnectionGraphView(analysis);
  const graphPath = path.join(outDir, `${repoSlug}-connection-graph.html`);

  await fs.writeFile(jsonPath, JSON.stringify(analysis, null, 2), "utf8");
  await fs.writeFile(
    htmlPath,
    renderHtmlReport(analysis, deprioritizedPaths),
    "utf8"
  );
  await fs.writeFile(
    mdPath,
    renderMarkdownReport(analysis, deprioritizedPaths),
    "utf8"
  );
  await fs.writeFile(graphPath, renderConnectionGraphHtml(graphView), "utf8");

  // Generate focus views for every system
  let focusCount = 0;
  for (const sys of analysis.systems) {
    const focusView = buildSystemFocusView(analysis, sys.id);
    if (!focusView) continue;
    const focusFileName = `${repoSlug}-focus-${slugify(sys.name)}.html`;
    const focusPath = path.join(outDir, focusFileName);
    await fs.writeFile(focusPath, renderSystemFocusHtml(focusView), "utf8");
    focusCount++;
  }

  console.log("Memor finished. Outputs:");
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  HTML: ${htmlPath}`);
  console.log(`  Markdown: ${mdPath}`);
  console.log(`  Graph: ${graphPath}`);
  console.log(`  Focus views: ${focusCount} files`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
