import { z } from "zod";

import {
  emptyToNull,
  nullableEnum,
  nullableNumber,
  nullableText,
  nullableUrl,
  requiredText,
} from "./schemas";

export const JOB_PLATFORMS = [
  "glints",
  "jobstreet",
  "linkedin",
  "glassdoor",
  "manual",
  "ats",
] as const;
export type JobPlatform = (typeof JOB_PLATFORMS)[number];

export const ACTIVE_SCRAPE_PLATFORMS = ["glints", "jobstreet", "linkedin"] as const;
export type ActiveScrapePlatform = (typeof ACTIVE_SCRAPE_PLATFORMS)[number];

export const JOB_SOURCE_TYPES = ["guest_scrape", "feed", "api", "manual"] as const;
export type JobSourceType = (typeof JOB_SOURCE_TYPES)[number];

export const WORK_MODES = ["onsite", "hybrid", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const APPLY_CHANNELS = ["email", "easy_apply", "portal", "link"] as const;
export type ApplyChannel = (typeof APPLY_CHANNELS)[number];

export const PLATFORM_SESSION_STATUSES = ["none", "logged_in", "expired"] as const;
export type PlatformSessionStatus = (typeof PLATFORM_SESSION_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "queued",
  "preparing",
  "needs_user",
  "ready",
  "sending",
  "sent",
  "replied",
  "failed",
  "cancelled",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DEFAULT_APPLY_DAILY_LIMIT = 10;
export const MAX_APPLY_DAILY_LIMIT = 25;

export function slugifyInterest(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const createInterestSchema = z.object({
  label: requiredText(80, "Nama minat wajib diisi.").refine(
    (value) => slugifyInterest(value).length >= 2,
    "Nama minat harus mengandung minimal 2 karakter alfanumerik.",
  ),
});
export type CreateInterestInput = z.input<typeof createInterestSchema>;

export const userPlatformPreferenceSchema = z.object({
  platform: z.enum(ACTIVE_SCRAPE_PLATFORMS),
  enabled: z.boolean(),
});

export const userSettingsPatchSchema = z.object({
  apply_daily_limit: z.coerce
    .number()
    .int("Batas antrean harus bilangan bulat.")
    .min(1, "Minimal 1 lamaran per hari.")
    .max(MAX_APPLY_DAILY_LIMIT, `Maksimal ${MAX_APPLY_DAILY_LIMIT} lamaran per hari.`),
  review_before_send: z.boolean(),
});

export const updatePreferencesSchema = z.object({
  interestIds: z.array(z.string().uuid("ID minat tidak valid.")).max(50).optional(),
  platforms: z.array(userPlatformPreferenceSchema).max(10).optional(),
  settings: userSettingsPatchSchema.partial().optional(),
});
export type UpdatePreferencesInput = z.input<typeof updatePreferencesSchema>;

const optionalEmailSchema = z.preprocess(
  emptyToNull,
  z.string().trim().email("Format email HR tidak valid.").max(160).nullable(),
);

const optionalPostedAtSchema = z.preprocess((value) => {
  const normalized = emptyToNull(value);
  if (normalized === null) return null;
  if (typeof normalized !== "string") return normalized;
  const trimmed = normalized.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
}, z.string().datetime({ message: "Format tanggal posting tidak valid." }).nullable());

const workModePreprocess = z.preprocess((value) => {
  const normalized = emptyToNull(value);
  if (normalized === null || typeof normalized !== "string") return normalized;
  const lower = normalized.trim().toLowerCase();
  if (lower === "on-site" || lower === "on site" || lower === "wfo") return "onsite";
  if (lower === "wfh") return "remote";
  return lower;
}, z.enum(WORK_MODES).nullable());

const baseManualJobFields = {
  title: requiredText(180, "Judul lowongan wajib diisi."),
  company: requiredText(160, "Nama perusahaan wajib diisi."),
  location: nullableText(160),
  work_mode: workModePreprocess,
  salary_min: nullableNumber(0, 1_000_000_000, true),
  salary_max: nullableNumber(0, 1_000_000_000, true),
  posted_at: optionalPostedAtSchema,
  hr_email: optionalEmailSchema,
};

function hasValidSalaryRange(value: {
  salary_min: number | null;
  salary_max: number | null;
}): boolean {
  return (
    value.salary_min === null ||
    value.salary_max === null ||
    value.salary_min <= value.salary_max
  );
}

const SALARY_RANGE_ERROR = {
  path: ["salary_max"] as PropertyKey[],
  message: "Gaji maksimum tidak boleh lebih kecil dari gaji minimum.",
};

const manualJobUrlBaseSchema = z.object({
  mode: z.literal("url"),
  url: z.string().trim().url("URL lowongan tidak valid.").max(1000),
  platform: nullableEnum(JOB_PLATFORMS).optional().default(null),
  description: nullableText(20_000).optional().default(null),
  ...baseManualJobFields,
});

const manualJobTextBaseSchema = z.object({
  mode: z.literal("text"),
  url: nullableUrl(1000).optional().default(null),
  description: requiredText(20_000, "Teks deskripsi lowongan wajib diisi."),
  ...baseManualJobFields,
});

export const manualJobUrlSchema = manualJobUrlBaseSchema.refine(
  hasValidSalaryRange,
  SALARY_RANGE_ERROR,
);

export const manualJobTextSchema = manualJobTextBaseSchema.refine(
  hasValidSalaryRange,
  SALARY_RANGE_ERROR,
);

export const manualJobInputSchema = z
  .discriminatedUnion("mode", [manualJobUrlBaseSchema, manualJobTextBaseSchema])
  .refine(hasValidSalaryRange, SALARY_RANGE_ERROR);
export type ManualJobInput = z.input<typeof manualJobInputSchema>;

export const csvJobRowSchema = z
  .object({
    title: requiredText(180, "Kolom title wajib diisi."),
    company: requiredText(160, "Kolom company wajib diisi."),
    location: nullableText(160).optional().default(null),
    work_mode: workModePreprocess.optional().default(null),
    description: nullableText(20_000).optional().default(null),
    url: nullableUrl(1000).optional().default(null),
    posted_at: optionalPostedAtSchema.optional().default(null),
    salary_min: nullableNumber(0, 1_000_000_000, true).optional().default(null),
    salary_max: nullableNumber(0, 1_000_000_000, true).optional().default(null),
    external_id: nullableText(160).optional().default(null),
    source_name: nullableText(120).optional().default(null),
    hr_email: optionalEmailSchema.optional().default(null),
  })
  .refine(hasValidSalaryRange, SALARY_RANGE_ERROR);
export type CsvJobRow = z.output<typeof csvJobRowSchema>;

export const csvImportPayloadSchema = z.object({
  csv: z
    .string()
    .trim()
    .min(1, "Isi CSV tidak boleh kosong.")
    .max(1_000_000, "Ukuran CSV maksimal 1 MB."),
});

export const queueApplicationsSchema = z.object({
  jobIds: z
    .array(z.string().uuid("ID lowongan tidak valid."))
    .min(1, "Pilih minimal satu lowongan.")
    .max(MAX_APPLY_DAILY_LIMIT, `Maksimal ${MAX_APPLY_DAILY_LIMIT} lowongan per permintaan.`),
});
export type QueueApplicationsInput = z.input<typeof queueApplicationsSchema>;

export const createRunnerSchema = z.object({
  name: requiredText(80, "Nama runner wajib diisi."),
});
export type CreateRunnerInput = z.input<typeof createRunnerSchema>;

export const toggleJobSourceSchema = z.object({
  enabled: z.boolean(),
});
export type ToggleJobSourceInput = z.input<typeof toggleJobSourceSchema>;
