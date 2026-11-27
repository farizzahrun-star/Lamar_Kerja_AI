import {
  ACTIVE_SCRAPE_PLATFORMS,
  SCRAPE_DAILY_LIMIT_PER_PLATFORM,
  buildDailySearchPlan,
  toJakartaDateString,
  type ActiveScrapePlatform,
} from "@lamarkerja/shared";

import type { WorkerLogger } from "./parse";
import type { WorkerSupabase } from "./supabase";

export interface RunnerPlanDeps {
  supabase: WorkerSupabase;
  now?: () => Date;
  log?: WorkerLogger;
}

const defaultLog: WorkerLogger = (event, data) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

/**
 * Memastikan rencana pencarian `scrape.daily` untuk hari WIB berjalan sudah
 * tersedia di `runner_tasks`. Idempoten (aman dijalankan berkala).
 */
export async function ensureDailyRunnerPlan(
  deps: RunnerPlanDeps,
): Promise<{ created: boolean; runDate: string; taskId?: string }> {
  const { supabase, now = () => new Date(), log = defaultLog } = deps;
  const runDate = toJakartaDateString(now());

  const { data: existing, error: readError } = await supabase
    .from("runner_tasks")
    .select("id")
    .eq("type", "scrape.daily")
    .eq("run_date", runDate)
    .maybeSingle();

  if (readError) {
    log("runner.plan.read_failed", { code: readError.code, message: readError.message });
    return { created: false, runDate };
  }

  if (existing) {
    return { created: false, runDate, taskId: existing.id };
  }

  const [sourcesRes, interestsRes, profilesRes] = await Promise.all([
    supabase
      .from("job_sources")
      .select("platform, enabled")
      .eq("type", "guest_scrape")
      .eq("enabled", true),
    supabase.from("user_interests").select("interests(label)"),
    supabase.from("profiles").select("address").not("address", "is", null),
  ]);

  for (const res of [sourcesRes, interestsRes, profilesRes]) {
    if (res.error) {
      log("runner.plan.query_failed", { code: res.error.code, message: res.error.message });
      return { created: false, runDate };
    }
  }

  const enabledPlatforms = (sourcesRes.data ?? [])
    .map((row) => row.platform)
    .filter((plat): plat is ActiveScrapePlatform =>
      (ACTIVE_SCRAPE_PLATFORMS as readonly string[]).includes(plat),
    );

  const interestLabels = (interestsRes.data ?? [])
    .map((row) => (row.interests as { label: string } | null)?.label ?? "")
    .filter(Boolean);

  const profileAddresses = (profilesRes.data ?? []).map((row) => row.address);

  const plan = buildDailySearchPlan({
    date: runDate,
    enabledPlatforms,
    interestLabels,
    profileAddresses,
    limitPerPlatform: SCRAPE_DAILY_LIMIT_PER_PLATFORM,
  });

  const { data: inserted, error: insertError } = await supabase
    .from("runner_tasks")
    .insert({
      type: "scrape.daily",
      run_date: runDate,
      status: "pending",
      payload_json: plan as never,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { created: false, runDate };
    }
    log("runner.plan.insert_failed", { code: insertError.code, message: insertError.message });
    return { created: false, runDate };
  }

  log("runner.plan.created", {
    taskId: inserted.id,
    runDate,
    platforms: enabledPlatforms,
  });

  return { created: true, runDate, taskId: inserted.id };
}
