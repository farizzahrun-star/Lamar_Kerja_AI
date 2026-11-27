import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEBUG_HTML_RETENTION_DAYS = 7;

export async function saveDebugHtml(params: {
  baseDir: string;
  runDate: string;
  platform: string;
  slug: string;
  html: string;
}): Promise<string> {
  const safePlatform = params.platform.replace(/[^a-z0-9_-]/gi, "_");
  const safeSlug = params.slug.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || "page";
  const targetDir = path.resolve(params.baseDir, params.runDate, safePlatform);
  await mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${safeSlug}.html`);
  await writeFile(filePath, params.html, "utf8");
  return filePath;
}

export async function cleanupExpiredDebugHtml(
  baseDir: string,
  now: Date = new Date(),
  retentionDays: number = DEBUG_HTML_RETENTION_DAYS,
): Promise<number> {
  const resolvedBase = path.resolve(baseDir);
  let entries: string[];
  try {
    entries = await readdir(resolvedBase);
  } catch {
    return 0;
  }

  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  let removedDirs = 0;

  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
    const entryDateMs = new Date(`${entry}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(entryDateMs) || entryDateMs >= cutoffMs) continue;

    await rm(path.join(resolvedBase, entry), { recursive: true, force: true });
    removedDirs++;
  }

  return removedDirs;
}
