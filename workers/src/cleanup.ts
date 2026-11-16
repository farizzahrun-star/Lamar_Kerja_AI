import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";

import type { WorkerLogger } from "./parse";
import type { WorkerSupabase } from "./supabase";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx"]);

export interface CleanupDeps {
  supabase: WorkerSupabase;
  cvStorageDir: string;
  limit?: number;
  now?: () => Date;
  removeFile?: (absolutePath: string) => Promise<void>;
  log?: WorkerLogger;
}

export interface CleanupResult {
  deletedRows: number;
  deletedFiles: number;
  skippedPaths: number;
}

const defaultLog: WorkerLogger = (event, data) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

/**
 * Guard path traversal yang sama dengan web app: hanya mengizinkan path di
 * bawah `<baseDir>/<userId>/*.pdf|docx`.
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

/**
 * Saat dijalankan dari `workers/` maupun root repo dengan `CV_STORAGE_DIR=./data/cv`,
 * file unggahan web bisa berada di `<repo>/data/cv` atau `<repo>/apps/web/data/cv`.
 * Mengembalikan seluruh kandidat direktori dasar yang aman.
 */
export function resolveCvStorageDirs(configuredDir: string, cwd = process.cwd()): string[] {
  if (path.isAbsolute(configuredDir)) {
    return [path.resolve(configuredDir)];
  }

  const repoRoot = path.basename(cwd) === "workers" ? path.resolve(cwd, "..") : path.resolve(cwd);
  const candidates = [
    path.resolve(cwd, configuredDir),
    path.resolve(repoRoot, configuredDir),
    path.resolve(repoRoot, "apps", "web", configuredDir),
  ];

  return [...new Set(candidates)];
}

async function defaultRemoveFile(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
    throw error;
  }
}

/**
 * Menghapus berkas dan baris `uploaded_cvs` yang sudah melewati `delete_after`
 * (retensi 30 hari atau hasil pencabutan consent). Penghapusan baris memicu
 * cascade ke `cv_parse_runs` dan `cv_parse_suggestions`.
 */
export async function cleanupExpiredCvs(deps: CleanupDeps): Promise<CleanupResult> {
  const {
    supabase,
    cvStorageDir,
    limit = 50,
    now = () => new Date(),
    removeFile = defaultRemoveFile,
    log = defaultLog,
  } = deps;

  const cutoffIso = now().toISOString();
  const baseDirs = resolveCvStorageDirs(cvStorageDir);

  const { data: rows, error } = await supabase
    .from("uploaded_cvs")
    .select("id, user_id, file_path")
    .lte("delete_after", cutoffIso)
    .order("delete_after", { ascending: true })
    .limit(limit);

  if (error) {
    log("cv.cleanup.select_failed", { code: error.code });
    return { deletedRows: 0, deletedFiles: 0, skippedPaths: 0 };
  }

  const expired = rows ?? [];
  if (expired.length === 0) {
    return { deletedRows: 0, deletedFiles: 0, skippedPaths: 0 };
  }

  let deletedRows = 0;
  let deletedFiles = 0;
  let skippedPaths = 0;

  for (const row of expired) {
    let anySafe = false;

    for (const baseDir of baseDirs) {
      const target = resolveSafeCvPath(baseDir, row.user_id, row.file_path);
      if (!target) continue;
      anySafe = true;

      const existed = existsSync(target);
      try {
        await removeFile(target);
        if (existed) deletedFiles += 1;
      } catch (fileError) {
        log("cv.cleanup.unlink_failed", {
          cvId: row.id,
          code: (fileError as NodeJS.ErrnoException)?.code ?? "unknown",
        });
      }
    }

    if (!anySafe) {
      skippedPaths += 1;
      log("cv.cleanup.unsafe_path", { cvId: row.id });
    }

    const { error: deleteError } = await supabase.from("uploaded_cvs").delete().eq("id", row.id);
    if (deleteError) {
      log("cv.cleanup.delete_failed", { cvId: row.id, code: deleteError.code });
      continue;
    }

    deletedRows += 1;
  }

  await supabase.from("audit_log").insert({
    actor_id: null,
    action: "cv.cleanup",
    entity: "uploaded_cvs",
    meta_json: {
      deletedRows,
      deletedFiles,
      skippedPaths,
    } as never,
  });

  log("cv.cleanup.completed", { deletedRows, deletedFiles, skippedPaths });
  return { deletedRows, deletedFiles, skippedPaths };
}
