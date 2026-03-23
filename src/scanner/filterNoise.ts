/**
 * Noise directories: skip recursion entirely and record for transparency.
 * Binary-heavy or generated paths are excluded from understanding-first scans.
 */
const SKIP_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "out",
  ".nuxt",
  ".output",
  ".vercel",
  ".parcel-cache",
  "target",
  ".gradle",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
]);

/** De-prioritize: we still traverse but tag for reporting */
const DEPRIORITIZED_DIRECTORY_NAMES = new Set([
  ".github",
  ".cursor",
  ".claude",
  "scripts",
  "test",
  "tests",
  "__tests__",
  "mocks",
  "__mocks__",
  "fixtures",
  "e2e",
  "cypress",
  "playwright",
  ".husky",
]);

const BINARY_LIKE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "zip",
  "tar",
  "gz",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp4",
  "mp3",
  "wasm",
  "so",
  "dylib",
  "dll",
  "exe",
]);

export function shouldSkipDirectory(dirName: string): boolean {
  return SKIP_DIRECTORY_NAMES.has(dirName);
}

export function isDeprioritizedDirectory(dirName: string): boolean {
  return DEPRIORITIZED_DIRECTORY_NAMES.has(dirName);
}

export function isLikelyNoiseFile(extension: string): boolean {
  if (!extension) return false;
  return BINARY_LIKE_EXTENSIONS.has(extension.toLowerCase());
}
