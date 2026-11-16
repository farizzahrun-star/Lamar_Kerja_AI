import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CV_AI_CONSENT_VERSION, cvDeleteAfter } from "@lamarkerja/shared";

import { readConfig } from "./config";
import { loadEnvFile } from "./env-file";
import {
  SYNTHETIC_CERTIFICATIONS,
  SYNTHETIC_CV_TEXT,
  SYNTHETIC_EDUCATIONS,
  SYNTHETIC_EXPERIENCES,
  SYNTHETIC_LANGUAGES,
  SYNTHETIC_PENDING_SUGGESTIONS,
  SYNTHETIC_PROFILE,
  SYNTHETIC_SKILLS,
  SYNTHETIC_USER,
} from "./fixtures";
import { CV_PARSE_PROMPT_VERSION } from "./prompts";
import { createWorkerSupabase, type WorkerSupabase } from "./supabase";

/**
 * Mengisi database dengan satu kandidat sintetis (`SYNTHETIC_USER`) beserta
 * profil lengkap, persetujuan AI aktif, satu CV contoh, dan satu saran
 * pending supaya halaman review bisa langsung dicoba.
 *
 * Idempoten: menjalankan ulang akan memperbarui user yang sama.
 */
export async function seedSyntheticCandidate(
  supabase: WorkerSupabase,
): Promise<{ userId: string; email: string }> {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) throw listError;

  const existing = listed.users.find((u) => u.email === SYNTHETIC_USER.email);
  let userId = existing?.id;

  if (!userId) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: SYNTHETIC_USER.email,
      password: SYNTHETIC_USER.password,
      email_confirm: true,
      user_metadata: { full_name: SYNTHETIC_USER.fullName },
    });
    if (createError || !created.user) throw createError ?? new Error("Gagal membuat user seed.");
    userId = created.user.id;
  }

  // Bersihkan data turunan lama agar hasil seed selalu konsisten.
  await Promise.all([
    supabase.from("educations").delete().eq("profile_id", userId),
    supabase.from("experiences").delete().eq("profile_id", userId),
    supabase.from("skills").delete().eq("profile_id", userId),
    supabase.from("certifications").delete().eq("profile_id", userId),
    supabase.from("languages").delete().eq("profile_id", userId),
    supabase.from("uploaded_cvs").delete().eq("user_id", userId),
    supabase.from("user_consents").delete().eq("user_id", userId),
  ]);

  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: userId,
    ...SYNTHETIC_PROFILE,
    onboarding_step: "languages",
    onboarding_completed_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;

  const { error: eduError } = await supabase
    .from("educations")
    .insert(SYNTHETIC_EDUCATIONS.map((edu) => ({ ...edu, profile_id: userId })));
  if (eduError) throw eduError;

  for (const exp of SYNTHETIC_EXPERIENCES) {
    const { points, ...fields } = exp;
    const { data: row, error: expError } = await supabase
      .from("experiences")
      .insert({ ...fields, profile_id: userId })
      .select("id")
      .single();
    if (expError) throw expError;

    if (points.length > 0) {
      const { error: pointError } = await supabase.from("experience_points").insert(
        points.map((content, index) => ({
          experience_id: row.id,
          content,
          sort_order: index,
        })),
      );
      if (pointError) throw pointError;
    }
  }

  const { error: skillError } = await supabase
    .from("skills")
    .insert(SYNTHETIC_SKILLS.map((skill) => ({ ...skill, profile_id: userId })));
  if (skillError) throw skillError;

  const { error: certError } = await supabase
    .from("certifications")
    .insert(SYNTHETIC_CERTIFICATIONS.map((cert) => ({ ...cert, profile_id: userId })));
  if (certError) throw certError;

  const { error: langError } = await supabase
    .from("languages")
    .insert(SYNTHETIC_LANGUAGES.map((lang) => ({ ...lang, profile_id: userId })));
  if (langError) throw langError;

  const { error: consentError } = await supabase.from("user_consents").insert({
    user_id: userId,
    kind: "cv_ai_processing",
    version: CV_AI_CONSENT_VERSION,
    user_agent_hash: createHash("sha256").update("lamarkerja-seed").digest("hex"),
  });
  if (consentError) throw consentError;

  const sha256 = createHash("sha256").update(SYNTHETIC_CV_TEXT).digest("hex");
  const { data: cvRow, error: cvError } = await supabase
    .from("uploaded_cvs")
    .insert({
      user_id: userId,
      file_path: `${userId}/seed-sintetis.pdf`,
      original_filename: "cv-nadia-sintetis.pdf",
      mime: "application/pdf",
      size_bytes: Buffer.byteLength(SYNTHETIC_CV_TEXT),
      sha256,
      text_content: SYNTHETIC_CV_TEXT,
      status: "extracted",
      delete_after: cvDeleteAfter().toISOString(),
    })
    .select("id")
    .single();
  if (cvError) throw cvError;

  const { data: runRow, error: runError } = await supabase
    .from("cv_parse_runs")
    .insert({
      uploaded_cv_id: cvRow.id,
      user_id: userId,
      section: "skills",
      model: "qwen3:4b",
      consent_version: CV_AI_CONSENT_VERSION,
      status: "parsed",
      attempts: 1,
      duration_ms: 1200,
      finished_at: new Date().toISOString(),
      output_json: {
        promptVersion: CV_PARSE_PROMPT_VERSION,
        model: "qwen3:4b",
        items: SYNTHETIC_PENDING_SUGGESTIONS.length,
        dropped: 0,
        repaired: false,
      } as never,
    })
    .select("id")
    .single();
  if (runError) throw runError;

  const { error: suggestionError } = await supabase.from("cv_parse_suggestions").insert(
    SYNTHETIC_PENDING_SUGGESTIONS.map((item) => ({
      parse_run_id: runRow.id,
      user_id: userId,
      section: item.section,
      field_path: item.field_path,
      value_json: item.value_json as never,
      confidence: item.confidence,
      source_snippet: item.source_snippet,
      status: "pending" as const,
    })),
  );
  if (suggestionError) throw suggestionError;

  return { userId, email: SYNTHETIC_USER.email };
}

async function runCli() {
  loadEnvFile([
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ]);

  const config = readConfig();
  const supabase = createWorkerSupabase(config.supabaseUrl, config.supabaseSecretKey);
  const seeded = await seedSyntheticCandidate(supabase);

  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      event: "db.seed.completed",
      userId: seeded.userId,
      note: "Gunakan email & password SYNTHETIC_USER di workers/src/fixtures.ts untuk login lokal.",
    })}\n`,
  );
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runCli().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "fatal",
        event: "db.seed.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
