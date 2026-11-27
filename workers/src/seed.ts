import {
  ACTIVE_SCRAPE_PLATFORMS,
  CV_AI_CONSENT_VERSION,
  DEFAULT_APPLY_DAILY_LIMIT,
  DEFAULT_INTERESTS,
  canonicalizeJobUrl,
  computeJobRawHash,
  cvDeleteAfter,
  extractHrEmails,
  getYesterdayJakartaDateString,
  shiftDateString,
} from "@lamarkerja/shared";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readConfig } from "./config";
import { loadEnvFile } from "./env-file";
import {
  SYNTHETIC_CERTIFICATIONS,
  SYNTHETIC_CV_TEXT,
  SYNTHETIC_EDUCATIONS,
  SYNTHETIC_EXPERIENCES,
  SYNTHETIC_JOBS,
  SYNTHETIC_LANGUAGES,
  SYNTHETIC_PENDING_SUGGESTIONS,
  SYNTHETIC_PROFILE,
  SYNTHETIC_SKILLS,
  SYNTHETIC_USER,
  SYNTHETIC_USER_INTEREST_SLUGS,
} from "./fixtures";
import { CV_PARSE_PROMPT_VERSION } from "./prompts";
import { createWorkerSupabase, type WorkerSupabase } from "./supabase";

async function seedPhase2Data(supabase: WorkerSupabase, userId: string): Promise<number> {
  // 1. Master interests
  const { error: interestsUpsertError } = await supabase.from("interests").upsert(
    DEFAULT_INTERESTS.map((item) => ({
      slug: item.slug,
      label: item.label,
      is_default: true,
    })),
    { onConflict: "slug" },
  );
  if (interestsUpsertError) throw interestsUpsertError;

  const { data: allInterests, error: interestsReadError } = await supabase
    .from("interests")
    .select("id, slug");
  if (interestsReadError) throw interestsReadError;

  const selectedInterestIds = (allInterests ?? [])
    .filter((item) => (SYNTHETIC_USER_INTEREST_SLUGS as readonly string[]).includes(item.slug))
    .map((item) => item.id);

  await supabase.from("user_interests").delete().eq("user_id", userId);
  if (selectedInterestIds.length > 0) {
    const { error: userInterestsError } = await supabase.from("user_interests").insert(
      selectedInterestIds.map((interestId) => ({
        user_id: userId,
        interest_id: interestId,
      })),
    );
    if (userInterestsError) throw userInterestsError;
  }

  // 2. Preferensi platform & settings
  const { error: platformsError } = await supabase.from("user_platforms").upsert(
    ACTIVE_SCRAPE_PLATFORMS.map((platform) => ({
      user_id: userId,
      platform,
      enabled: true,
      session_status: "none" as const,
    })),
    { onConflict: "user_id,platform" },
  );
  if (platformsError) throw platformsError;

  const { error: settingsError } = await supabase.from("user_settings").upsert(
    {
      user_id: userId,
      review_before_send: true,
      portal_auto_submit: false,
      apply_daily_limit: DEFAULT_APPLY_DAILY_LIMIT,
    },
    { onConflict: "user_id" },
  );
  if (settingsError) throw settingsError;

  // 3. Job sources default
  const defaultSources = [
    {
      platform: "glints" as const,
      type: "guest_scrape" as const,
      name: "Glints Public Search",
      config_json: { dailyLimit: 10 },
      enabled: true,
    },
    {
      platform: "jobstreet" as const,
      type: "guest_scrape" as const,
      name: "Jobstreet Public Search",
      config_json: { dailyLimit: 10 },
      enabled: true,
    },
    {
      platform: "linkedin" as const,
      type: "guest_scrape" as const,
      name: "LinkedIn Public Search",
      config_json: { dailyLimit: 10 },
      enabled: true,
    },
    {
      platform: "manual" as const,
      type: "manual" as const,
      name: "Manual & CSV Import",
      config_json: {},
      enabled: true,
    },
  ];

  const { error: sourcesUpsertError } = await supabase
    .from("job_sources")
    .upsert(defaultSources, { onConflict: "platform,type,name" });
  if (sourcesUpsertError) throw sourcesUpsertError;

  const { data: sourceRows, error: sourcesReadError } = await supabase
    .from("job_sources")
    .select("id, platform");
  if (sourcesReadError) throw sourcesReadError;

  const sourceIdByPlatform = new Map((sourceRows ?? []).map((row) => [row.platform, row.id]));

  // 4. Lowongan sintetis + snapshot H-1 (dan H-2 untuk sebagian)
  const h1Date = getYesterdayJakartaDateString();
  const h2Date = shiftDateString(h1Date, -1);
  const h3Date = shiftDateString(h1Date, -2);
  const nowIso = new Date().toISOString();

  for (let index = 0; index < SYNTHETIC_JOBS.length; index++) {
    const fixture = SYNTHETIC_JOBS[index]!;
    const canonicalUrl = canonicalizeJobUrl(fixture.url);
    const rawHash = computeJobRawHash({
      title: fixture.title,
      company: fixture.company,
      location: fixture.location,
    });
    const sourceId = sourceIdByPlatform.get(fixture.platform) ?? null;
    const postedAt = new Date(Date.now() - (index + 1) * 6 * 3600 * 1000).toISOString();

    const { data: existingJob, error: findError } = await supabase
      .from("jobs")
      .select("id")
      .eq("raw_hash", rawHash)
      .maybeSingle();
    if (findError) throw findError;

    let jobId = existingJob?.id;
    if (!jobId) {
      const { data: insertedJob, error: insertJobError } = await supabase
        .from("jobs")
        .insert({
          source_id: sourceId,
          external_id: fixture.external_id,
          title: fixture.title,
          company: fixture.company,
          location: fixture.location,
          work_mode: fixture.work_mode,
          salary_min: fixture.salary_min,
          salary_max: fixture.salary_max,
          description: fixture.description,
          url: canonicalUrl,
          posted_at: postedAt,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          raw_hash: rawHash,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insertJobError) throw insertJobError;
      jobId = insertedJob.id;
    }

    if (canonicalUrl) {
      const { error: urlError } = await supabase.from("job_urls").upsert(
        {
          job_id: jobId,
          platform: fixture.platform,
          url: canonicalUrl,
          apply_channel: fixture.apply_channel,
          is_primary: true,
        },
        { onConflict: "job_id,platform,url" },
      );
      if (urlError) throw urlError;
    }

    const emails = extractHrEmails(fixture.description);
    for (const hrEmail of emails) {
      const { data: existingContact, error: contactReadError } = await supabase
        .from("job_contacts")
        .select("id")
        .eq("job_id", jobId)
        .ilike("hr_email", hrEmail)
        .maybeSingle();
      if (contactReadError) throw contactReadError;
      if (!existingContact) {
        const { error: contactInsertError } = await supabase.from("job_contacts").insert({
          job_id: jobId,
          hr_email: hrEmail,
          source: "description",
        });
        if (contactInsertError && contactInsertError.code !== "23505") {
          throw contactInsertError;
        }
      }
    }

    const snapshotRows = [{ job_id: jobId, snapshot_date: h1Date }];
    if (fixture.includeH2) {
      snapshotRows.push({ job_id: jobId, snapshot_date: h2Date });
    }
    const { error: snapError } = await supabase
      .from("job_snapshots")
      .upsert(snapshotRows, { onConflict: "job_id,snapshot_date", ignoreDuplicates: true });
    if (snapError) throw snapError;
  }

  // 5. Collector runs sintetis 3 hari terakhir (idempoten untuk run sintetis runner_id=null)
  await supabase
    .from("collector_runs")
    .delete()
    .is("runner_id", null)
    .in("run_date", [h1Date, h2Date, h3Date]);

  const makeRunTimes = (dateStr: string, hourUtc: number) => ({
    started_at: `${dateStr}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`,
    finished_at: `${dateStr}T${String(hourUtc).padStart(2, "0")}:04:30.000Z`,
  });

  const collectorFixtures = [
    {
      platform: "glints" as const,
      run_date: h1Date,
      ...makeRunTimes(h1Date, 12),
      found: 8,
      new_count: 2,
      skipped_known: 6,
      blocked: false,
      error_count: 0,
      last_error: null,
    },
    {
      platform: "jobstreet" as const,
      run_date: h1Date,
      ...makeRunTimes(h1Date, 12),
      found: 7,
      new_count: 3,
      skipped_known: 4,
      blocked: false,
      error_count: 0,
      last_error: null,
    },
    {
      platform: "linkedin" as const,
      run_date: h1Date,
      ...makeRunTimes(h1Date, 12),
      found: 4,
      new_count: 2,
      skipped_known: 2,
      blocked: false,
      error_count: 0,
      last_error: null,
    },
    {
      platform: "glints" as const,
      run_date: h2Date,
      ...makeRunTimes(h2Date, 12),
      found: 6,
      new_count: 1,
      skipped_known: 5,
      blocked: false,
      error_count: 0,
      last_error: null,
    },
    {
      platform: "linkedin" as const,
      run_date: h2Date,
      ...makeRunTimes(h2Date, 12),
      found: 1,
      new_count: 0,
      skipped_known: 0,
      blocked: true,
      error_count: 1,
      last_error: "Authwall terdeteksi pada halaman pencarian publik (seed sintetis).",
    },
    {
      platform: "jobstreet" as const,
      run_date: h3Date,
      ...makeRunTimes(h3Date, 12),
      found: 5,
      new_count: 2,
      skipped_known: 3,
      blocked: false,
      error_count: 0,
      last_error: null,
    },
  ];

  const { error: runsError } = await supabase.from("collector_runs").insert(collectorFixtures);
  if (runsError) throw runsError;

  return SYNTHETIC_JOBS.length;
}

/**
 * Mengisi database dengan satu kandidat sintetis (`SYNTHETIC_USER`) beserta
 * profil lengkap, persetujuan AI aktif, satu CV contoh, saran pending, dan
 * data Phase 2 (minat, lowongan H-1, collector_runs).
 *
 * Idempoten: menjalankan ulang akan memperbarui data yang sama.
 */
export async function seedSyntheticCandidate(
  supabase: WorkerSupabase,
): Promise<{ userId: string; email: string; jobsSeeded: number }> {
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

  const jobsSeeded = await seedPhase2Data(supabase, userId);

  return { userId, email: SYNTHETIC_USER.email, jobsSeeded };
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
      jobsSeeded: seeded.jobsSeeded,
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
