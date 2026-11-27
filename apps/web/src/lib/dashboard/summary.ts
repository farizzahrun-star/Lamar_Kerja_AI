import "server-only";

import { evaluateRunnerAlerts, type RunnerAlert } from "@lamarkerja/shared";

import { countPendingSuggestions } from "@/lib/cv/review-data";
import { loadJobsFeed } from "@/lib/jobs/queries";
import { loadUserApplications } from "@/lib/applications/service";
import type {
  ApplicationListItem,
  JobFeedItem,
  JobsFeedMeta,
  PlatformStatusSummary,
} from "@/lib/phase2-types";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export interface DashboardSummary {
  firstName: string;
  isProfileComplete: boolean;
  pendingSuggestions: number;
  resumesCount: number;
  jobsMeta: JobsFeedMeta;
  topJobs: JobFeedItem[];
  applicationsQuota: {
    used: number;
    limit: number;
    remaining: number;
    dateWib: string;
  };
  recentApplications: ApplicationListItem[];
  applicationCounts: Record<string, number>;
  platformStatus: PlatformStatusSummary[];
  runnerAlerts: RunnerAlert[];
}

export async function loadDashboardSummary(
  supabase: Client,
  userId: string,
): Promise<DashboardSummary> {
  const [profileRes, resumesRes, pendingSuggestions, jobsFeed, applications, runsRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, onboarding_completed_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.from("resumes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      countPendingSuggestions(supabase, userId),
      loadJobsFeed(supabase, userId, { snapshot: "h1" }),
      loadUserApplications(supabase, userId),
      supabase
        .from("collector_runs")
        .select("*")
        .order("run_date", { ascending: false })
        .order("started_at", { ascending: false })
        .limit(45),
    ]);

  if (profileRes.error) throw profileRes.error;
  if (resumesRes.error) throw resumesRes.error;
  if (runsRes.error) throw runsRes.error;

  const firstName = profileRes.data?.full_name?.trim().split(/\s+/)[0] ?? "Anda";

  return {
    firstName,
    isProfileComplete: Boolean(profileRes.data?.onboarding_completed_at),
    pendingSuggestions,
    resumesCount: resumesRes.count ?? 0,
    jobsMeta: jobsFeed.meta,
    topJobs: jobsFeed.items.slice(0, 5),
    applicationsQuota: applications.quota,
    recentApplications: applications.items.slice(0, 5),
    applicationCounts: applications.countsByStatus,
    platformStatus: jobsFeed.meta.platformStatus,
    runnerAlerts: evaluateRunnerAlerts(runsRes.data ?? []),
  };
}
