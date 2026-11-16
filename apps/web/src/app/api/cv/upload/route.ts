import { CV_PARSE_SECTIONS, cvDeleteAfter } from "@lamarkerja/shared";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { dbErrorResponse, getApiContext, jsonError, unauthorized } from "@/lib/api";
import { recordAuditLog, requireConsent } from "@/lib/consent";
import { loadUserUploadedCvs } from "@/lib/cv/data";
import { extractCvText } from "@/lib/cv/extraction";
import { CV_UPLOAD_WINDOW_MS, evaluateUploadRateLimit } from "@/lib/cv/rate-limit";
import { removeCvFileQuietly, writeCvFile } from "@/lib/cv/storage";
import { validateCvBuffer } from "@/lib/cv/validation";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  try {
    const items = await loadUserUploadedCvs(supabase, user.id);
    return NextResponse.json({ data: items });
  } catch (error) {
    return dbErrorResponse(error as { code?: string });
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await getApiContext();
  if (!user) return unauthorized();

  const consentCheck = await requireConsent(supabase, user.id, "cv_ai_processing");
  if (!consentCheck.ok) {
    return consentCheck.response;
  }

  const cutoffIso = new Date(Date.now() - CV_UPLOAD_WINDOW_MS).toISOString();
  const { data: recentUploads, error: recentError } = await supabase
    .from("uploaded_cvs")
    .select("created_at")
    .eq("user_id", user.id)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: true })
    .limit(env.CV_UPLOAD_MAX_PER_HOUR + 1);

  if (recentError) return dbErrorResponse(recentError);

  const rateLimit = evaluateUploadRateLimit({
    timestamps: (recentUploads ?? []).map((row) => row.created_at),
    maxUploads: env.CV_UPLOAD_MAX_PER_HOUR,
  });

  if (!rateLimit.allowed) {
    logEvent("warn", "cv.upload_rate_limited", {
      userId: user.id,
      maxPerHour: env.CV_UPLOAD_MAX_PER_HOUR,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
    const response = jsonError(
      429,
      "RATE_LIMITED",
      `Batas unggah CV (${env.CV_UPLOAD_MAX_PER_HOUR} berkas per jam) tercapai. Silakan coba lagi sebentar.`,
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return response;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "INVALID_FORM_DATA", "Format pengiriman berkas tidak valid.");
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return jsonError(400, "MISSING_FILE", "Berkas CV wajib disertakan.");
  }

  const rawFile = file as File;
  const arrayBuffer = await rawFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const validated = validateCvBuffer(buffer, rawFile.name);
  if (!validated.ok) {
    return jsonError(400, validated.code, validated.message);
  }

  let extracted;
  try {
    extracted = await extractCvText(buffer, validated.extension);
  } catch {
    logEvent("error", "cv.extraction_failed", {
      userId: user.id,
      filename: validated.filename,
      mime: validated.mime,
    });
    return jsonError(500, "EXTRACTION_FAILED", "Gagal membaca isi berkas CV.");
  }

  const cvId = randomUUID();
  let written;
  try {
    written = await writeCvFile(
      env.CV_STORAGE_DIR,
      user.id,
      cvId,
      validated.extension,
      buffer,
    );
  } catch {
    logEvent("error", "cv.storage_write_failed", { userId: user.id });
    return jsonError(500, "STORAGE_ERROR", "Gagal menyimpan berkas CV ke disk.");
  }

  const admin = createAdminSupabase();
  const deleteAfterIso = cvDeleteAfter().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("uploaded_cvs")
    .insert({
      id: cvId,
      user_id: user.id,
      file_path: written.relativePath,
      original_filename: validated.filename,
      mime: validated.mime,
      size_bytes: validated.sizeBytes,
      sha256: validated.sha256,
      text_content: extracted.normalizedText || null,
      status: extracted.status,
      delete_after: deleteAfterIso,
    })
    .select("id, original_filename, mime, size_bytes, status, created_at, delete_after")
    .single();

  if (insertError || !inserted) {
    await removeCvFileQuietly(written.absolutePath);
    return dbErrorResponse(insertError ?? { code: "unknown" });
  }

  // Antrekan job parsing per bagian. Bila AI dinonaktifkan atau teks tidak
  // memadai (hasil scan), tidak ada run yang dibuat sehingga worker tidak
  // memproses apa pun dan user tetap dapat mengisi profil manual.
  let enqueuedRuns = 0;
  if (extracted.status === "extracted" && env.AI_ENABLED) {
    const runs = CV_PARSE_SECTIONS.map((section) => ({
      uploaded_cv_id: cvId,
      user_id: user.id,
      section,
      model: env.OLLAMA_MODEL,
      consent_version: consentCheck.consent.version,
      status: "pending" as const,
    }));

    const { data: insertedRuns, error: runsError } = await admin
      .from("cv_parse_runs")
      .insert(runs)
      .select("id");

    if (runsError) {
      logEvent("warn", "cv.parse_enqueue_failed", {
        userId: user.id,
        cvId,
        code: runsError.code,
      });
    } else {
      enqueuedRuns = insertedRuns?.length ?? 0;
    }
  }

  await recordAuditLog({
    actorId: user.id,
    action: "cv.uploaded",
    entity: "uploaded_cvs",
    entityId: cvId,
    meta: {
      filename: validated.filename,
      mime: validated.mime,
      sizeBytes: validated.sizeBytes,
      sha256: validated.sha256,
      status: extracted.status,
      charCount: extracted.normalizedText.length,
      enqueuedRuns,
      aiEnabled: env.AI_ENABLED,
    },
  });

  logEvent("info", "cv.uploaded", {
    userId: user.id,
    cvId,
    status: extracted.status,
    charCount: extracted.normalizedText.length,
    mime: validated.mime,
    enqueuedRuns,
  });

  const message =
    extracted.status === "skipped"
      ? "PDF hasil scan atau tidak memiliki teks yang memadai. Ekstraksi otomatis dilewati, silakan isi data diri secara manual."
      : enqueuedRuns > 0
        ? "Berkas CV berhasil diunggah dan teks berhasil diekstrak. Antrean parsing profil (4 bagian) telah dibuat."
        : "Berkas CV berhasil diunggah dan teks berhasil diekstrak.";

  return NextResponse.json(
    {
      data: {
        id: inserted.id,
        original_filename: inserted.original_filename,
        mime: inserted.mime,
        size_bytes: inserted.size_bytes,
        status: inserted.status,
        created_at: inserted.created_at,
        delete_after: inserted.delete_after,
        hasText: extracted.status === "extracted",
        charCount: extracted.normalizedText.length,
        parseRunsQueued: enqueuedRuns,
        message,
      },
    },
    { status: 201 },
  );
}
