import * as fs from "fs/promises";
import * as path from "path";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readTextSafe(
  filePath: string,
  maxBytes = 512 * 1024
): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const buf = await fs.readFile(filePath, "utf8");
    return buf;
  } catch {
    return null;
  }
}

export async function listDirNames(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((e) => e.name);
  } catch {
    return [];
  }
}

export function getExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
}
