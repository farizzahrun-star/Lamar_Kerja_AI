import "server-only";

import {
  ACTIVE_SCRAPE_PLATFORMS,
  SCRAPE_DAILY_LIMIT_PER_PLATFORM,
  buildDailySearchPlan,
  toJakartaDateString,
  type ActiveScrapePlatform,
  type DailySearchPlan,
  type KnownJobFingerprints,
  type RunnerTasksResponsePayload,
} from "@lamarkerja/shared";

import { createAdminSupabase } from "@/lib/supabase/admin";

const STALE_CLAIM_MS = 2 * 60 * 60 * 1000;

export async function generateDailyPlanFromDb(runDate: string): Promise<DailySearchPlan> {
  const admin = createAdminSupabase();

  const [sourcesRes, userInterestsRes, profilesRes] = await Promise.all([
    admin
      .from("job_sources")
      .select("platform, enabled, config_json")
      .eq("type", "guest_scrape")
      .eq("enabled", true),
    admin.from("user_interests").select("interests(label)"),
    admin.from("profiles").select("address").not("address", "is", null),
  ]);

  for (const res of [sourcesRes, userInterestsRes, profilesRes]) {
    if (res.error) throw res.error;
  }

  const enabledPlatforms = (sourcesRes.data ?? [])
    .map((row) => row.platform)
    .filter((plat): plat is ActiveScrapePlatform =>
      (ACTIVE_SCRAPE_PLATFORMS as readonly string[]).includes(plat),
    );

  const interestLabels = (userInterestsRes.data ?? [])
    .map((row) => (row.interests as { label: string } | null)?.label ?? "")
    .filter(Boolean);

  const addresses = (profilesRes.data ?? []).map((row) => row.address);

  return buildDailySearchPlan({
    date: runDate,
    enabledPlatforms,
    interestLabels,
    profileAddresses: addresses,
    limitPerPlatform: SCRAPE_DAILY_LIMIT_PER_PLATFORM,
  });
}

async function loadKnownJobFingerprints(): Promise<KnownJobFingerprints> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("jobs")
    .select("external_id, url, raw_hash")
    .order("last_seen_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const externalIds: string[] = [];
  const canonicalUrls: string[] = [];
  const rawHashes: string[] = [];

  for (const row of data ?? []) {
    if (row.external_id) externalIds.push(row.external_id);
    if (row.url) canonicalUrls.push(row.url);
    if (row.raw_hash) rawHashes.push(row.raw_hash);
  }

  return { externalIds, canonicalUrls, rawHashes };
}

export async function pullDailyScrapeTaskForRunner(
  runnerId: string,
  options: { force?: boolean } = {},
): Promise<RunnerTasksResponsePayload> {
  const admin = createAdminSupabase();
  const runDate = toJakartaDateString();
  const knownFingerprints = await loadKnownJobFingerprints();

  const { data: existingTask, error: readError } = await admin
    .from("runner_tasks")
    .select("*")
    .eq("type", "scrape.daily")
    .eq("run_date", runDate)
    .maybeSingle();

  if (readError) throw readError;

  let task = existingTask;

  if (!task) {
    const plan = await generateDailyPlanFromDb(runDate);
    const { data: inserted, error: insertError } = await admin
      .from("runner_tasks")
      .insert({
        type: "scrape.daily",
        run_date: runDate,
        status: "pending",
        payload_json: plan as never,
      })
      .select("*")
      .single();

    if (insertError) {
      if (insertError.code !== "23505") throw insertError;
      const retry = await admin
        .from("runner_tasks")
        .select("*")
        .eq("type", "scrape.daily")
        .eq("run_date", runDate)
        .single();
      if (retry.error) throw retry.error;
      task = retry.data;
    } else {
      task = inserted;
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const isStaleClaim =
    task.status === "claimed" &&
    task.claimed_at !== null &&
    now.getTime() - new Date(task.claimed_at).getTime() > STALE_CLAIM_MS;

  const canClaim =
    task.status === "pending" ||
    isStaleClaim ||
    (task.status === "claimed" && task.runner_id === runnerId) ||
    Boolean(options.force);

  if (!canClaim) {
    return { task: null, knownFingerprints };
  }

  // Segarkan plan terhadap preferensi terbaru jika task belum selesai.
  const latestPlan =
    task.status === "pending" || options.force
      ? await generateDailyPlanFromDb(runDate)
      : (task.payload_json as unknown as DailySearchPlan);

  const { data: claimed, error: updateError } = await admin
    .from("runner_tasks")
    .update({
      runner_id: runnerId,
      status: "claimed",
      claimed_at: nowIso,
      finished_at: null,
      payload_json: latestPlan as never,
    })
    .eq("id", task.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  return {
    task: {
      id: claimed.id,
      type: "scrape.daily",
      run_date: claimed.run_date,
      plan: claimed.payload_json as unknown as DailySearchPlan,
    },
    knownFingerprints,
  };
}
