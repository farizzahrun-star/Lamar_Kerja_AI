import { CV_AI_CONSENT_VERSION, type CvParseSection } from "@lamarkerja/shared";
import type { Database } from "@lamarkerja/db";

import { CircuitBreaker } from "./circuit-breaker";
import { OllamaError, type OllamaClient } from "./ollama";
import { buildRepairPrompt, buildSectionPrompt, CV_PARSE_PROMPT_VERSION } from "./prompts";
import { buildSuggestions, SECTION_SCHEMAS } from "./sections";
import type { WorkerSupabase } from "./supabase";

export type ParseRunRow = Database["public"]["Tables"]["cv_parse_runs"]["Row"];

export type WorkerLogger = (event: string, data?: Record<string, unknown>) => void;

export interface ParseDeps {
  supabase: WorkerSupabase;
  ollama: OllamaClient;
  breaker: CircuitBreaker;
  maxAttempts: number;
  requiredConsentVersion?: string;
  now?: () => Date;
  log?: WorkerLogger;
}

export type RunOutcome =
  | { kind: "parsed"; runId: string; suggestions: number; dropped: number }
  | { kind: "skipped"; runId: string; code: string }
  | { kind: "failed"; runId: string; code: string; retryable: boolean }
  | { kind: "empty" };

const defaultLog: WorkerLogger = (event, data) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

function errorCodeFrom(error: unknown): string {
  if (error instanceof OllamaError) {
    switch (error.code) {
      case "TIMEOUT":
        return "OLLAMA_TIMEOUT";
      case "NETWORK":
        return "OLLAMA_UNAVAILABLE";
      case "HTTP_ERROR":
        return "OLLAMA_HTTP_ERROR";
      case "EMPTY_RESPONSE":
        return "OLLAMA_EMPTY";
      case "INVALID_JSON":
        return "OLLAMA_INVALID_JSON";
    }
  }
  return "PARSE_ERROR";
}

function summarizeZodError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ path?: (string | number)[]; message?: string }> })
      .issues;
    if (Array.isArray(issues)) {
      return issues
        .slice(0, 10)
        .map((issue) => `${(issue.path ?? []).join(".")}: ${issue.message ?? "invalid"}`)
        .join("; ");
    }
  }
  return error instanceof Error ? error.message : "validasi gagal";
}

/**
 * Mengambil satu run `pending` secara optimistis: update hanya berhasil bila
 * status masih `pending` dan `attempts` belum berubah. Worker lain yang lebih
 * dulu mengklaim akan menang, sehingga tidak ada pemrosesan ganda.
 */
export async function claimRun(deps: ParseDeps): Promise<ParseRunRow | null> {
  const { supabase, log = defaultLog, now = () => new Date() } = deps;

  const { data: candidates, error: selectError } = await supabase
    .from("cv_parse_runs")
    .select("id, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  if (selectError) {
    log("worker.claim_failed", { code: selectError.code, message: selectError.message });
    return null;
  }

  for (const candidate of candidates ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from("cv_parse_runs")
      .update({
        status: "running",
        started_at: now().toISOString(),
        attempts: candidate.attempts + 1,
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .eq("attempts", candidate.attempts)
      .select("*")
      .maybeSingle();

    if (claimError) {
      log("worker.claim_failed", { runId: candidate.id, code: claimError.code });
      continue;
    }

    if (claimed) return claimed;
  }

  return null;
}

async function markSkipped(
  deps: ParseDeps,
  run: ParseRunRow,
  code: string,
  finishedAt: string,
): Promise<RunOutcome> {
  const { supabase, log = defaultLog } = deps;

  const { error } = await supabase
    .from("cv_parse_runs")
    .update({ status: "skipped", error_code: code, finished_at: finishedAt })
    .eq("id", run.id)
    .eq("status", "running");

  if (error) log("worker.update_failed", { runId: run.id, code: error.code });
  log("cv.parse.skipped", { runId: run.id, section: run.section, code });
  return { kind: "skipped", runId: run.id, code };
}

/**
 * Menjalankan satu run parsing lengkap: cek consent aktif, ambil teks CV,
 * panggil Ollama (dengan satu kali repair), lalu simpan saran yang lolos
 * grounding. Tidak ada jalur yang menulis langsung ke tabel profil.
 */
export async function processRun(deps: ParseDeps, run: ParseRunRow): Promise<RunOutcome> {
  const {
    supabase,
    ollama,
    breaker,
    requiredConsentVersion = CV_AI_CONSENT_VERSION,
    log = defaultLog,
    now = () => new Date(),
  } = deps;
  const startedAtMs = now().getTime();
  const finishedIso = () => now().toISOString();

  // 1. Consent masih aktif dan versinya terkini.
  if (run.consent_version !== requiredConsentVersion) {
    return markSkipped(deps, run, "CONSENT_OUTDATED", finishedIso());
  }

  const { data: consent, error: consentError } = await supabase
    .from("user_consents")
    .select("version, revoked_at")
    .eq("user_id", run.user_id)
    .eq("kind", "cv_ai_processing")
    .is("revoked_at", null)
    .maybeSingle();

  if (consentError) {
    log("worker.consent_check_failed", { runId: run.id, code: consentError.code });
    return failRun(deps, run, "CONSENT_CHECK_FAILED", true, finishedIso());
  }

  if (!consent || consent.version !== requiredConsentVersion) {
    return markSkipped(deps, run, "CONSENT_REVOKED", finishedIso());
  }

  // 2. Teks CV harus tersedia dan bukan hasil scan.
  const { data: cv, error: cvError } = await supabase
    .from("uploaded_cvs")
    .select("text_content, status, delete_after")
    .eq("id", run.uploaded_cv_id)
    .maybeSingle();

  if (cvError) {
    log("worker.cv_load_failed", { runId: run.id, code: cvError.code });
    return failRun(deps, run, "CV_LOAD_FAILED", true, finishedIso());
  }

  const text = cv?.text_content?.trim() ?? "";
  if (!cv || cv.status === "skipped" || text.length < 50) {
    return markSkipped(deps, run, "NO_EXTRACTABLE_TEXT", finishedIso());
  }

  if (new Date(cv.delete_after).getTime() <= startedAtMs) {
    return markSkipped(deps, run, "CV_EXPIRED", finishedIso());
  }

  // 3. Panggil Ollama dengan satu kali repair bila validasi gagal.
  if (!breaker.canAttempt()) {
    return failRun(deps, run, "CIRCUIT_OPEN", true, finishedIso());
  }

  const section = run.section as CvParseSection;
  const schema = SECTION_SCHEMAS[section];
  const prompt = buildSectionPrompt(section, text);

  let output: unknown;
  let repaired = false;
  let firstError: unknown = null;

  try {
    output = await ollama.chatJson({ system: prompt.system, prompt: prompt.user, schema: prompt.schema });
    schema.parse(output);
    breaker.recordSuccess();
  } catch (error) {
    firstError = error;

    if (error instanceof OllamaError) {
      breaker.recordFailure();
      log("cv.parse.ollama_failed", {
        runId: run.id,
        section,
        code: error.code,
        status: error.status,
      });
      return failRun(deps, run, errorCodeFrom(error), true, finishedIso());
    }

    // Kegagalan validasi: minta model memperbaiki sekali.
    repaired = true;
    log("cv.parse.repair", { runId: run.id, section, reason: summarizeZodError(error) });

    try {
      const repair = buildRepairPrompt(
        section,
        text,
        JSON.stringify(output ?? null),
        summarizeZodError(firstError),
      );
      output = await ollama.chatJson({
        system: repair.system,
        prompt: repair.user,
        schema: repair.schema,
        temperature: 0,
      });
      schema.parse(output);
      breaker.recordSuccess();
    } catch (repairError) {
      if (repairError instanceof OllamaError) {
        breaker.recordFailure();
        return failRun(deps, run, errorCodeFrom(repairError), true, finishedIso());
      }
      log("cv.parse.invalid_after_repair", {
        runId: run.id,
        section,
        reason: summarizeZodError(repairError),
      });
      return failRun(deps, run, "SCHEMA_INVALID", true, finishedIso());
    }
  }

  // 4. Grounding + normalisasi.
  let built;
  try {
    built = buildSuggestions(section, output, text);
  } catch (error) {
    log("cv.parse.normalize_failed", { runId: run.id, section, reason: summarizeZodError(error) });
    return failRun(deps, run, "SCHEMA_INVALID", true, finishedIso());
  }

  const durationMs = now().getTime() - startedAtMs;
  const finishedAt = finishedIso();

  // 5. Simpan saran (idempoten: hapus sisa percobaan sebelumnya dulu).
  const { error: deleteError } = await supabase
    .from("cv_parse_suggestions")
    .delete()
    .eq("parse_run_id", run.id);

  if (deleteError) {
    log("worker.suggestion_cleanup_failed", { runId: run.id, code: deleteError.code });
    return failRun(deps, run, "SUGGESTION_WRITE_FAILED", true, finishedAt);
  }

  if (built.suggestions.length > 0) {
    const { error: insertError } = await supabase.from("cv_parse_suggestions").insert(
      built.suggestions.map((suggestion) => ({
        parse_run_id: run.id,
        user_id: run.user_id,
        section,
        field_path: suggestion.field_path,
        value_json: suggestion.value_json as never,
        confidence: suggestion.confidence,
        source_snippet: suggestion.source_snippet,
        status: "pending" as const,
      })),
    );

    if (insertError) {
      log("worker.suggestion_insert_failed", { runId: run.id, code: insertError.code });
      return failRun(deps, run, "SUGGESTION_WRITE_FAILED", true, finishedAt);
    }
  }

  const { error: updateError } = await supabase
    .from("cv_parse_runs")
    .update({
      status: "parsed",
      finished_at: finishedAt,
      duration_ms: durationMs,
      error_code: null,
      output_json: {
        promptVersion: CV_PARSE_PROMPT_VERSION,
        model: run.model,
        items: built.suggestions.length,
        dropped: built.dropped,
        repaired,
      } as never,
    })
    .eq("id", run.id)
    .eq("status", "running");

  if (updateError) {
    log("worker.update_failed", { runId: run.id, code: updateError.code });
  }

  log("cv.parse.parsed", {
    runId: run.id,
    section,
    suggestions: built.suggestions.length,
    dropped: built.dropped,
    durationMs,
    repaired,
  });

  return {
    kind: "parsed",
    runId: run.id,
    suggestions: built.suggestions.length,
    dropped: built.dropped,
  };
}

async function failRun(
  deps: ParseDeps,
  run: ParseRunRow,
  code: string,
  retryable: boolean,
  finishedAt: string,
): Promise<RunOutcome> {
  const { supabase, maxAttempts, log = defaultLog } = deps;
  const canRetry = retryable && run.attempts < maxAttempts;

  const { error } = await supabase
    .from("cv_parse_runs")
    .update(
      canRetry
        ? { status: "pending", error_code: code, started_at: null }
        : { status: "failed", error_code: code, finished_at: finishedAt },
    )
    .eq("id", run.id)
    .eq("status", "running");

  if (error) log("worker.update_failed", { runId: run.id, code: error.code });

  log(canRetry ? "cv.parse.retry_scheduled" : "cv.parse.failed", {
    runId: run.id,
    section: run.section,
    code,
    attempts: run.attempts,
  });

  return { kind: "failed", runId: run.id, code, retryable: canRetry };
}

/**
 * Saat `AI_ENABLED=false`, seluruh run pending ditandai `skipped` supaya user
 * langsung diarahkan ke pengisian manual alih-alih menggantung selamanya.
 */
export async function skipAllPendingRuns(deps: ParseDeps): Promise<number> {
  const { supabase, log = defaultLog } = deps;
  const finishedAt = (deps.now ?? (() => new Date()))().toISOString();

  const { data, error } = await supabase
    .from("cv_parse_runs")
    .update({ status: "skipped", error_code: "AI_DISABLED", finished_at: finishedAt })
    .eq("status", "pending")
    .select("id");

  if (error) {
    log("worker.skip_all_failed", { code: error.code });
    return 0;
  }

  return data?.length ?? 0;
}
