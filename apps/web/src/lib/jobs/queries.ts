import "server-only";

import {
  getJakartaDayBoundsUtc,
  getYesterdayJakartaDateString,
  matchesUserInterests,
  selectBestApplicationChannel,
  shiftDateString,
  toJakartaDateString,
  type ApplyChannel,
  type JobPlatform,
  type WorkMode,
} from "@lamarkerja/shared";

import type { JobDetailData, JobFeedItem, JobsFeedResponse } from "@/lib/phase2-types";
import { ensureUserPreferences } from "@/lib/preferences/data";
import { buildPlatformStatusSummary } from "@/lib/runner/platform-status";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface JobsFilterOptions {
  snapshot?: "h1" | "today" | "all";
  showAll?: boolean;
  platform?: JobPlatform | "all";
  workMode?: WorkMode | "all";
  channel?: ApplyChannel | "all";
  query?: string;
}

export async function getUserDailyQuota(
  supabase: Client,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number; dateWib: string }> {
  const settings = await ensureUserPreferences(supabase, userId);
  const todayWib = toJakartaDateString();
  const { startIso, endIso } = getJakartaDayBoundsUtc(todayWib);

  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .gte("queued_at", startIso)
    .lt("queued_at", endIso);

  if (error) throw error;

  const used = count ?? 0;
  const limit = settings.apply_daily_limit;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    dateWib: todayWib,
  };
}

export async function loadJobsFeed(
  supabase: Client,
  userId: string,
  filters: JobsFilterOptions = {},
): Promise<JobsFeedResponse> {
  const snapshotMode = filters.snapshot ?? "h1";
  const todayWib = toJakartaDateString();
  const yesterdayWib = getYesterdayJakartaDateString();
  const requestedDate = snapshotMode === "today" ? todayWib : yesterdayWib;
  const minRunDate = shiftDateString(todayWib, -14);

  const [quota, userInterestsRes, sourcesRes, runsRes, snapshotDatesRes] = await Promise.all([
    getUserDailyQuota(supabase, userId),
    supabase.from("user_interests").select("interest_id, interests(label)").eq("user_id", userId),
    supabase.from("job_sources").select("*"),
    supabase
      .from("collector_runs")
      .select("*")
      .gte("run_date", minRunDate)
      .order("run_date", { ascending: false })
      .order("started_at", { ascending: false })
      .limit(60),
    supabase
      .from("job_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(200),
  ]);

  for (const res of [userInterestsRes, sourcesRes, runsRes, snapshotDatesRes]) {
    if (res.error) throw res.error;
  }

  const availableDates = [
    ...new Set((snapshotDatesRes.data ?? []).map((row) => row.snapshot_date)),
  ].sort((a, b) => b.localeCompare(a));

  let activeSnapshotDate: string | null = null;
  let isFallback = false;

  if (snapshotMode === "h1") {
    if (availableDates.includes(yesterdayWib)) {
      activeSnapshotDate = yesterdayWib;
    } else if (availableDates.length > 0) {
      activeSnapshotDate = availableDates[0] ?? null;
      isFallback = activeSnapshotDate !== null;
    }
  } else if (snapshotMode === "today") {
    activeSnapshotDate = availableDates.includes(todayWib) ? todayWib : null;
  }

  let candidateJobIds: string[] | null = null;
  if (snapshotMode !== "all") {
    if (!activeSnapshotDate) {
      candidateJobIds = [];
    } else {
      const { data: snapshotRows, error: snapError } = await supabase
        .from("job_snapshots")
        .select("job_id")
        .eq("snapshot_date", activeSnapshotDate);
      if (snapError) throw snapError;
      candidateJobIds = (snapshotRows ?? []).map((row) => row.job_id);
    }
  }

  const interestLabels = (userInterestsRes.data ?? [])
    .map((row) => {
      const interest = row.interests as { label: string } | null;
      return interest?.label ?? "";
    })
    .filter(Boolean);

  const runs = runsRes.data ?? [];
  const sources = sourcesRes.data ?? [];
  const platformStatus = buildPlatformStatusSummary(sources, runs);
  const lastRunAt = runs[0] ? (runs[0].finished_at ?? runs[0].started_at) : null;

  if (candidateJobIds !== null && candidateJobIds.length === 0) {
    return {
      items: [],
      meta: {
        snapshotMode,
        requestedDate,
        snapshotDate: activeSnapshotDate,
        isFallback,
        lastRunAt,
        availableDates,
        interestLabels,
        filteredByInterest: !filters.showAll && interestLabels.length > 0,
        totalInSnapshot: 0,
        dailyQuota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
        platformStatus,
      },
    };
  }

  let jobsQuery = supabase
    .from("jobs")
    .select(
      "id, source_id, title, company, location, work_mode, salary_min, salary_max, description, url, posted_at, first_seen_at, last_seen_at, job_sources(platform), job_urls(platform, url, apply_channel, is_primary), job_contacts(id), job_snapshots(snapshot_date)",
    )
    .order("posted_at", { ascending: false, nullsFirst: false })
    .order("first_seen_at", { ascending: false })
    .limit(120);

  if (candidateJobIds !== null) {
    jobsQuery = jobsQuery.in("id", candidateJobIds);
  }

  const [jobsRes, appsRes] = await Promise.all([
    jobsQuery,
    supabase
      .from("applications")
      .select("id, job_id, status, channel, queued_at")
      .eq("user_id", userId)
      .neq("status", "cancelled"),
  ]);

  if (jobsRes.error) throw jobsRes.error;
  if (appsRes.error) throw appsRes.error;

  const appByJobId = new Map(
    (appsRes.data ?? []).map((app) => [
      app.job_id,
      {
        id: app.id,
        status: app.status,
        channel: app.channel,
        queued_at: app.queued_at,
      },
    ]),
  );

  const allMapped: JobFeedItem[] = (jobsRes.data ?? []).map((row) => {
    const sourceObj = row.job_sources as { platform: JobPlatform } | null;
    const urls = (row.job_urls ?? []) as Array<{
      platform: JobPlatform;
      url: string;
      apply_channel: ApplyChannel;
      is_primary: boolean;
    }>;
    const contacts = (row.job_contacts ?? []) as Array<{ id: string }>;
    const snapshots = (row.job_snapshots ?? []) as Array<{ snapshot_date: string }>;

    const platforms = [
      ...new Set<JobPlatform>([
        ...urls.map((u) => u.platform),
        ...(sourceObj ? [sourceObj.platform] : []),
      ]),
    ];
    if (platforms.length === 0) platforms.push("manual");

    const primaryUrl = urls.find((u) => u.is_primary) ?? urls[0];
    const primaryPlatform = primaryUrl?.platform ?? sourceObj?.platform ?? "manual";
    const bestChannel = selectBestApplicationChannel(
      urls.map((u) => u.apply_channel),
      contacts.length > 0,
    );

    const compactDesc = row.description.replace(/\s+/g, " ").trim();
    const preview = compactDesc.length > 210 ? `${compactDesc.slice(0, 207)}…` : compactDesc;

    return {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location,
      work_mode: row.work_mode,
      salary_min: row.salary_min,
      salary_max: row.salary_max,
      description_preview: preview,
      url: row.url ?? primaryUrl?.url ?? null,
      posted_at: row.posted_at,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      snapshot_dates: snapshots.map((s) => s.snapshot_date).sort((a, b) => b.localeCompare(a)),
      platforms,
      primary_platform: primaryPlatform,
      best_channel: bestChannel,
      hr_emails_count: contacts.length,
      has_hr_email: contacts.length > 0,
      application: appByJobId.get(row.id) ?? null,
      _fullDescription: row.description,
    };
  }) as Array<JobFeedItem & { _fullDescription: string }>;

  const useInterestFilter = !filters.showAll && interestLabels.length > 0;
  const searchNeedle = filters.query?.trim().toLowerCase() ?? "";

  const filtered = allMapped
    .filter((item) => {
      const fullDesc = (item as JobFeedItem & { _fullDescription: string })._fullDescription;
      if (
        useInterestFilter &&
        !matchesUserInterests({ title: item.title, description: fullDesc }, interestLabels)
      ) {
        return false;
      }
      if (filters.platform && filters.platform !== "all") {
        if (!item.platforms.includes(filters.platform)) return false;
      }
      if (filters.workMode && filters.workMode !== "all") {
        if (item.work_mode !== filters.workMode) return false;
      }
      if (filters.channel && filters.channel !== "all") {
        if (item.best_channel !== filters.channel) return false;
      }
      if (searchNeedle) {
        const hay = `${item.title} ${item.company} ${item.location ?? ""} ${fullDesc}`.toLowerCase();
        if (!hay.includes(searchNeedle)) return false;
      }
      return true;
    })
    .map((item) => {
      const clean = { ...(item as JobFeedItem & { _fullDescription?: string }) };
      delete clean._fullDescription;
      return clean;
    });

  return {
    items: filtered,
    meta: {
      snapshotMode,
      requestedDate,
      snapshotDate: activeSnapshotDate,
      isFallback,
      lastRunAt,
      availableDates,
      interestLabels,
      filteredByInterest: useInterestFilter,
      totalInSnapshot: allMapped.length,
      dailyQuota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
      platformStatus,
    },
  };
}

export async function loadJobDetail(
  supabase: Client,
  userId: string,
  jobId: string,
): Promise<JobDetailData | null> {
  const [jobRes, appRes, quota] = await Promise.all([
    supabase
      .from("jobs")
      .select(
        "id, title, company, location, work_mode, salary_min, salary_max, description, url, posted_at, first_seen_at, last_seen_at, job_sources(platform, type, name), job_urls(id, platform, url, apply_channel, is_primary), job_contacts(id, hr_email, source), job_snapshots(snapshot_date)",
      )
      .eq("id", jobId)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("id, status, channel, queued_at, cancelled_at")
      .eq("user_id", userId)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getUserDailyQuota(supabase, userId),
  ]);

  if (jobRes.error) throw jobRes.error;
  if (appRes.error) throw appRes.error;
  if (!jobRes.data) return null;

  const row = jobRes.data;
  const urls = (row.job_urls ?? []) as JobDetailData["urls"];
  const contacts = (row.job_contacts ?? []) as JobDetailData["contacts"];
  const snapshots = ((row.job_snapshots ?? []) as Array<{ snapshot_date: string }>)
    .map((item) => item.snapshot_date)
    .sort((a, b) => b.localeCompare(a));

  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    work_mode: row.work_mode,
    salary_min: row.salary_min,
    salary_max: row.salary_max,
    description: row.description,
    url: row.url,
    posted_at: row.posted_at,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at,
    source: (row.job_sources as JobDetailData["source"]) ?? null,
    urls,
    contacts,
    snapshot_dates: snapshots,
    best_channel: selectBestApplicationChannel(
      urls.map((u) => u.apply_channel),
      contacts.length > 0,
    ),
    application: appRes.data ?? null,
    dailyQuota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
  };
}
