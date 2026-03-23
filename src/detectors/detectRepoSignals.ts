import * as path from "path";
import { listDirNames, pathExists, readTextSafe } from "../utils/file";
import { parseJsonLoose } from "../utils/text";
import type { RepoSignals } from "../types";
import { joinRelative } from "../utils/path";

function addFramework(frameworks: Set<string>, name: string): void {
  frameworks.add(name);
}

/**
 * Reads root-level manifests and filenames to infer stack and monorepo layout.
 */
export async function detectRepoSignals(repoRoot: string): Promise<RepoSignals> {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const signalPaths: string[] = [];

  const rootNames = await listDirNames(repoRoot);
  const nameSet = new Set(rootNames);

  if (nameSet.has("pnpm-lock.yaml")) {
    packageManagers.add("pnpm");
    signalPaths.push("pnpm-lock.yaml");
  }
  if (nameSet.has("yarn.lock")) {
    packageManagers.add("yarn");
    signalPaths.push("yarn.lock");
  }
  if (nameSet.has("package-lock.json")) {
    packageManagers.add("npm");
    signalPaths.push("package-lock.json");
  }
  if (nameSet.has("bun.lockb")) {
    packageManagers.add("bun");
    signalPaths.push("bun.lockb");
  }

  const hasAppsDir = nameSet.has("apps");
  const hasPackagesDir = nameSet.has("packages");

  const workspaceYaml =
    (await readTextSafe(joinRelative(repoRoot, "pnpm-workspace.yaml"))) ??
    (await readTextSafe(joinRelative(repoRoot, "pnpm-workspace.yml")));

  if (workspaceYaml) {
    signalPaths.push(
      nameSet.has("pnpm-workspace.yaml")
        ? "pnpm-workspace.yaml"
        : "pnpm-workspace.yml"
    );
    addFramework(frameworks, "pnpm-workspace");
  }

  const turboRaw = await readTextSafe(joinRelative(repoRoot, "turbo.json"));
  if (turboRaw) {
    signalPaths.push("turbo.json");
    addFramework(frameworks, "Turborepo");
  }

  const lernaRaw = await readTextSafe(joinRelative(repoRoot, "lerna.json"));
  if (lernaRaw) {
    signalPaths.push("lerna.json");
    addFramework(frameworks, "Lerna");
  }

  const nxRaw = await readTextSafe(joinRelative(repoRoot, "nx.json"));
  if (nxRaw) {
    signalPaths.push("nx.json");
    addFramework(frameworks, "Nx");
  }

  const pkgRaw = await readTextSafe(joinRelative(repoRoot, "package.json"));
  if (pkgRaw) {
    signalPaths.push("package.json");
    const pkg = parseJsonLoose(pkgRaw);
    if (pkg) {
      const deps = {
        ...((pkg.dependencies as Record<string, string>) || {}),
        ...((pkg.devDependencies as Record<string, string>) || {}),
        ...((pkg.peerDependencies as Record<string, string>) || {}),
      };
      const depKeys = Object.keys(deps);
      const has = (n: string) => depKeys.includes(n);

      if (has("next")) addFramework(frameworks, "Next.js");
      if (has("react") || has("react-dom")) addFramework(frameworks, "React");
      if (has("vite")) addFramework(frameworks, "Vite");
      if (has("@nestjs/core")) addFramework(frameworks, "NestJS");
      if (has("express")) addFramework(frameworks, "Express");
      if (has("fastify")) addFramework(frameworks, "Fastify");
      if (has("koa")) addFramework(frameworks, "Koa");
      if (has("@storybook/react") || has("storybook")) {
        addFramework(frameworks, "Storybook");
      }
      if (has("@docusaurus/core")) addFramework(frameworks, "Docusaurus");
      if (has("nextra")) addFramework(frameworks, "Nextra");
      if (has("prisma") || has("@prisma/client")) {
        addFramework(frameworks, "Prisma");
      }
      if (has("@supabase/supabase-js")) addFramework(frameworks, "Supabase JS");
      if (pkg.workspaces) addFramework(frameworks, "npm-workspaces");
    }
  }

  for (const fname of [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
  ]) {
    if (nameSet.has(fname)) {
      signalPaths.push(fname);
      addFramework(frameworks, "Next.js");
    }
  }
  for (const fname of ["vite.config.ts", "vite.config.js"]) {
    if (nameSet.has(fname)) {
      signalPaths.push(fname);
      addFramework(frameworks, "Vite");
    }
  }
  if (nameSet.has("nest-cli.json")) {
    signalPaths.push("nest-cli.json");
    addFramework(frameworks, "NestJS");
  }
  if (nameSet.has("docker-compose.yml") || nameSet.has("docker-compose.yaml")) {
    signalPaths.push(
      nameSet.has("docker-compose.yml")
        ? "docker-compose.yml"
        : "docker-compose.yaml"
    );
    addFramework(frameworks, "Docker Compose");
  }
  if (nameSet.has("Dockerfile")) {
    signalPaths.push("Dockerfile");
    addFramework(frameworks, "Docker");
  }

  if (nameSet.has(".storybook")) {
    signalPaths.push(".storybook");
    addFramework(frameworks, "Storybook");
  }

  const isMonorepoLayout =
    hasAppsDir ||
    hasPackagesDir ||
    !!workspaceYaml ||
    !!turboRaw ||
    !!lernaRaw ||
    !!nxRaw ||
    frameworks.has("npm-workspaces");

  return {
    frameworks: [...frameworks].sort(),
    isMonorepoLayout,
    hasAppsDir,
    hasPackagesDir,
    packageManagers: [...packageManagers].sort(),
    signalPaths: [...new Set(signalPaths)].sort(),
  };
}

export async function fileExistsAt(
  repoRoot: string,
  relativePath: string
): Promise<boolean> {
  const full = path.join(repoRoot, ...relativePath.split("/"));
  return pathExists(full);
}
