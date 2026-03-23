import * as path from "path";

export function normalizeRepoRoot(input: string): string {
  return path.resolve(input);
}

export function joinRelative(root: string, ...segments: string[]): string {
  return path.join(root, ...segments);
}

export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function relativeToRoot(root: string, fullPath: string): string {
  const rel = path.relative(root, fullPath);
  return rel === "" ? "." : toPosix(rel);
}

/** Path from `ancestorDir` to `fullPath`, posix; empty string if same path. */
export function relativeFromDir(ancestorDir: string, fullPath: string): string {
  const rel = path.relative(ancestorDir, fullPath);
  if (rel === "" || rel === ".") return "";
  return toPosix(rel);
}
