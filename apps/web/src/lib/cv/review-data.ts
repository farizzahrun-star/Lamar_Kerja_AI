import "server-only";

import type {
  CvReviewData,
  CvReviewGroup,
  CvReviewRun,
  CvReviewSuggestion,
} from "@/lib/cv/review-types";
import { loadProfileBundle } from "@/lib/profile-data";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const MAX_CVS = 20;

/**
 * Memuat riwayat CV beserta run parsing dan saran yang dihasilkan. Semua query
 * memakai client RLS milik user, sehingga user hanya bisa melihat datanya
 * sendiri. Halaman review memfilter saran berstatus `pending`.
 */
export async function loadCvReviewData(
  supabase: Client,
  userId: string,
): Promise<CvReviewData> {
  const [bundle, cvsResult, runsResult, suggestionsResult] = await Promise.all([
    loadProfileBundle(supabase, userId),
    supabase
      .from("uploaded_cvs")
      .select("id, original_filename, status, created_at, delete_after")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_CVS),
    supabase
      .from("cv_parse_runs")
      .select("id, uploaded_cv_id, section, status, error_code, attempts, finished_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("cv_parse_suggestions")
      .select(
        "id, parse_run_id, section, field_path, value_json, confidence, source_snippet, status, created_at, decided_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  for (const result of [cvsResult, runsResult, suggestionsResult]) {
    if (result.error) throw result.error;
  }

  if (!cvsResult.data?.length) {
    return { groups: [], bundle };
  }

  const runsByCv = new Map<string, CvReviewRun[]>();
  for (const run of runsResult.data ?? []) {
    const list = runsByCv.get(run.uploaded_cv_id) ?? [];
    list.push({
      id: run.id,
      section: run.section,
      status: run.status,
      error_code: run.error_code,
      attempts: run.attempts,
      finished_at: run.finished_at,
    });
    runsByCv.set(run.uploaded_cv_id, list);
  }

  const runToCv = new Map<string, string>();
  for (const run of runsResult.data ?? []) {
    runToCv.set(run.id, run.uploaded_cv_id);
  }

  const suggestionsByCv = new Map<string, CvReviewSuggestion[]>();
  for (const row of suggestionsResult.data ?? []) {
    const cvId = runToCv.get(row.parse_run_id);
    if (!cvId) continue;

    const list = suggestionsByCv.get(cvId) ?? [];
    list.push({
      id: row.id,
      parse_run_id: row.parse_run_id,
      section: row.section,
      field_path: row.field_path,
      value_json: row.value_json,
      confidence: Number(row.confidence),
      source_snippet: row.source_snippet,
      status: row.status,
      created_at: row.created_at,
      decided_at: row.decided_at,
    });
    suggestionsByCv.set(cvId, list);
  }

  const groups: CvReviewGroup[] = cvsResult.data.map((cv) => ({
    cv: {
      id: cv.id,
      original_filename: cv.original_filename,
      status: cv.status,
      created_at: cv.created_at,
      delete_after: cv.delete_after,
    },
    runs: runsByCv.get(cv.id) ?? [],
    suggestions: suggestionsByCv.get(cv.id) ?? [],
  }));

  return { groups, bundle };
}

/** Jumlah saran yang masih menunggu keputusan user. */
export async function countPendingSuggestions(
  supabase: Client,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("cv_parse_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (error) throw error;
  return count ?? 0;
}
