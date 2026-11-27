import { z } from "zod";

import {
  ACTIVE_SCRAPE_PLATFORMS,
  APPLY_CHANNELS,
  WORK_MODES,
  type ActiveScrapePlatform,
} from "./phase2-schemas";
import { emptyToNull, nullableNumber, nullableText, nullableUrl, requiredText } from "./schemas";

export const SCRAPE_DAILY_LIMIT_PER_PLATFORM = 10;
export const SCRAPE_DELAY_MIN_MS = 20_000;
export const SCRAPE_DELAY_MAX_MS = 45_000;

export const searchQuerySchema = z.object({
  keyword: requiredText(100),
  location: nullableText(100),
  limit: z.number().int().min(1).max(SCRAPE_DAILY_LIMIT_PER_PLATFORM),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const platformSearchPlanSchema = z.object({
  platform: z.enum(ACTIVE_SCRAPE_PLATFORMS),
  limit: z.number().int().min(1).max(SCRAPE_DAILY_LIMIT_PER_PLATFORM),
  queries: z.array(searchQuerySchema).min(1).max(10),
});
export type PlatformSearchPlan = z.infer<typeof platformSearchPlanSchema>;

export const dailySearchPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platforms: z.array(platformSearchPlanSchema),
});
export type DailySearchPlan = z.infer<typeof dailySearchPlanSchema>;

const optionalIsoDateTime = z.preprocess((value) => {
  const norm = emptyToNull(value);
  if (norm === null || typeof norm !== "string") return norm;
  const trimmed = norm.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}, z.string().datetime().nullable());

const workModePreprocess = z.preprocess((value) => {
  const norm = emptyToNull(value);
  if (norm === null || typeof norm !== "string") return norm;
  const lower = norm.trim().toLowerCase();
  if (lower === "on-site" || lower === "on site" || lower === "wfo") return "onsite";
  if (lower === "wfh") return "remote";
  return lower;
}, z.enum(WORK_MODES).nullable());

export const rawScrapedJobSchema = z.object({
  platform: z.enum(ACTIVE_SCRAPE_PLATFORMS),
  external_id: nullableText(180).optional().default(null),
  title: requiredText(180),
  company: requiredText(160),
  location: nullableText(160).optional().default(null),
  work_mode: workModePreprocess.optional().default(null),
  salary_min: nullableNumber(0, 1_000_000_000, true).optional().default(null),
  salary_max: nullableNumber(0, 1_000_000_000, true).optional().default(null),
  description: nullableText(25_000).optional().default(null),
  url: nullableUrl(1000).optional().default(null),
  posted_at: optionalIsoDateTime.optional().default(null),
  apply_channel: z.preprocess(emptyToNull, z.enum(APPLY_CHANNELS).nullable()).optional().default(null),
  hr_email: z
    .preprocess(emptyToNull, z.string().trim().email().max(160).nullable())
    .optional()
    .default(null),
});
export type RawScrapedJob = z.output<typeof rawScrapedJobSchema>;

export const runnerJobsSubmissionSchema = z.object({
  task_id: z.string().uuid().nullable().optional().default(null),
  platform: z.enum(ACTIVE_SCRAPE_PLATFORMS),
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  found: z.number().int().min(0).max(500),
  skipped_known: z.number().int().min(0).max(500),
  blocked: z.boolean(),
  error_count: z.number().int().min(0).max(500),
  last_error: nullableText(1000).optional().default(null),
  jobs: z.array(rawScrapedJobSchema).max(25),
});
export type RunnerJobsSubmission = z.output<typeof runnerJobsSubmissionSchema>;

export const runnerTaskResultSchema = z.object({
  status: z.enum(["completed", "failed", "blocked"]),
  summary: z
    .object({
      total_found: z.number().int().min(0),
      total_new_submitted: z.number().int().min(0),
      total_skipped: z.number().int().min(0),
      blocked_platforms: z.array(z.enum(ACTIVE_SCRAPE_PLATFORMS)).default([]),
    })
    .optional(),
  error_message: nullableText(1000).optional().default(null),
});
export type RunnerTaskResultInput = z.output<typeof runnerTaskResultSchema>;

export interface KnownJobFingerprints {
  externalIds: string[];
  canonicalUrls: string[];
  rawHashes: string[];
}

export interface RunnerTasksResponsePayload {
  task: {
    id: string;
    type: "scrape.daily";
    run_date: string;
    plan: DailySearchPlan;
  } | null;
  knownFingerprints: KnownJobFingerprints;
}

const FALLBACK_KEYWORDS = ["Backend Developer", "Frontend Developer", "Fullstack Developer"];
const FALLBACK_LOCATION = "Indonesia";

function extractPrimaryCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const firstSegment = address.split(",")[0]?.trim() ?? "";
  if (firstSegment.length < 2) return null;
  return firstSegment.slice(0, 60);
}

/**
 * Menyusun rencana pencarian harian guest scraping dari gabungan minat user tim
 * dan lokasi profil, membagi kuota 10/platform secara merata antar query.
 */
export function buildDailySearchPlan(params: {
  date: string;
  enabledPlatforms: ActiveScrapePlatform[];
  interestLabels: string[];
  profileAddresses?: Array<string | null | undefined>;
  limitPerPlatform?: number;
}): DailySearchPlan {
  const limitPerPlatform = Math.max(
    1,
    Math.min(
      SCRAPE_DAILY_LIMIT_PER_PLATFORM,
      params.limitPerPlatform ?? SCRAPE_DAILY_LIMIT_PER_PLATFORM,
    ),
  );

  const uniqueKeywords = [
    ...new Set(
      params.interestLabels
        .map((label) => label.trim())
        .filter((label) => label.length >= 2),
    ),
  ];
  const keywords = (uniqueKeywords.length > 0 ? uniqueKeywords : FALLBACK_KEYWORDS).slice(0, 5);

  const uniqueCities = [
    ...new Set(
      (params.profileAddresses ?? [])
        .map((addr) => extractPrimaryCity(addr))
        .filter((city): city is string => Boolean(city)),
    ),
  ];
  const defaultLocation = uniqueCities[0] ?? FALLBACK_LOCATION;

  const queriesPerPlatform = keywords.map((keyword, idx): SearchQuery => {
    const baseQuota = Math.floor(limitPerPlatform / keywords.length);
    const remainder = limitPerPlatform % keywords.length;
    const quota = Math.max(1, baseQuota + (idx < remainder ? 1 : 0));
    const location = uniqueCities[idx % Math.max(1, uniqueCities.length)] ?? defaultLocation;
    return {
      keyword,
      location,
      limit: quota,
    };
  });

  return {
    date: params.date,
    platforms: params.enabledPlatforms.map((platform) => ({
      platform,
      limit: limitPerPlatform,
      queries: queriesPerPlatform,
    })),
  };
}
