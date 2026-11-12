import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Memastikan path relatif resume (`<user_id>/<resume_id>.pdf`) tetap berada di
 * dalam direktori milik `userId` di bawah `baseDir`. Menolak segala bentuk
 * traversal (`..`, path absolut, atau segmen user lain).
 */
export function resolveSafeResumePath(
  baseDir: string,
  userId: string,
  relativePdfPath: string,
): string | null {
  if (!userId || !relativePdfPath || path.isAbsolute(relativePdfPath)) {
    return null;
  }

  const rootDir = path.resolve(baseDir);
  const userDir = path.resolve(rootDir, userId);
  const target = path.resolve(rootDir, relativePdfPath);

  const expectedPrefix = userDir.endsWith(path.sep) ? userDir : `${userDir}${path.sep}`;
  if (!target.startsWith(expectedPrefix) || path.extname(target).toLowerCase() !== ".pdf") {
    return null;
  }

  return target;
}

export function buildRelativeResumePath(userId: string, resumeId: string): string {
  return path.posix.join(userId, `${resumeId}.pdf`);
}

export async function writeResumeFile(
  baseDir: string,
  userId: string,
  resumeId: string,
  pdfBuffer: Buffer,
): Promise<{ relativePath: string; absolutePath: string }> {
  const relativePath = buildRelativeResumePath(userId, resumeId);
  const absolutePath = resolveSafeResumePath(baseDir, userId, relativePath);
  if (!absolutePath) {
    throw new Error("Path penyimpanan resume tidak valid.");
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, pdfBuffer);
  return { relativePath, absolutePath };
}

export async function readResumeFile(
  baseDir: string,
  userId: string,
  relativePdfPath: string,
): Promise<Buffer | null> {
  const absolutePath = resolveSafeResumePath(baseDir, userId, relativePdfPath);
  if (!absolutePath) return null;

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

export async function removeResumeFileQuietly(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch {
    // Abaikan bila file sudah tidak ada.
  }
}
