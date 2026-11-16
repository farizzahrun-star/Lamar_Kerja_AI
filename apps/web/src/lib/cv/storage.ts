import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);

/**
 * Memastikan path file CV berada di bawah `baseDir/<user_id>/` dengan ekstensi
 * yang diizinkan. Menolak upaya path traversal (.., path absolut, user lain).
 */
export function resolveSafeCvPath(
  baseDir: string,
  userId: string,
  relativeCvPath: string,
): string | null {
  if (!userId || !relativeCvPath || path.isAbsolute(relativeCvPath)) {
    return null;
  }

  const rootDir = path.resolve(baseDir);
  const userDir = path.resolve(rootDir, userId);
  const target = path.resolve(rootDir, relativeCvPath);

  const expectedPrefix = userDir.endsWith(path.sep) ? userDir : `${userDir}${path.sep}`;
  const ext = path.extname(target).toLowerCase();

  if (!target.startsWith(expectedPrefix) || !ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

  return target;
}

export function buildRelativeCvPath(
  userId: string,
  cvId: string,
  extension: "pdf" | "docx",
): string {
  return path.posix.join(userId, `${cvId}.${extension}`);
}

export async function writeCvFile(
  baseDir: string,
  userId: string,
  cvId: string,
  extension: "pdf" | "docx",
  buffer: Buffer,
): Promise<{ relativePath: string; absolutePath: string }> {
  const relativePath = buildRelativeCvPath(userId, cvId, extension);
  const absolutePath = resolveSafeCvPath(baseDir, userId, relativePath);
  if (!absolutePath) {
    throw new Error("Path penyimpanan CV tidak valid.");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  return { relativePath, absolutePath };
}

export async function readCvFile(
  baseDir: string,
  userId: string,
  relativeCvPath: string,
): Promise<Buffer | null> {
  const absolutePath = resolveSafeCvPath(baseDir, userId, relativeCvPath);
  if (!absolutePath) return null;

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function removeCvFileQuietly(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch {
    // Abaikan bila file sudah tidak ada
  }
}
