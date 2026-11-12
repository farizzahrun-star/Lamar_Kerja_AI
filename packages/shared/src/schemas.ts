import { z } from "zod";

/**
 * Schema validasi profil. Dipakai Route Handlers (web) dan nanti worker
 * `cv.parse` saat memvalidasi saran hasil parsing, sehingga kontraknya harus
 * stabil dan tidak bergantung pada UI.
 */

export const EDUCATION_LEVELS = ["SMA", "SMK", "D3", "S1", "S2", "S3"] as const;
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
] as const;
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const ONBOARDING_STEPS = [
  "identity",
  "educations",
  "experiences",
  "skills",
  "certifications",
  "languages",
] as const;

export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

function emptyToNull(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

export function nullableText(max: number) {
  return z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
}

export function requiredText(max: number, message = "Wajib diisi.") {
  return z.string().trim().min(1, message).max(max);
}

export function nullableUrl(max = 500) {
  return z.preprocess(
    emptyToNull,
    z.string().trim().url("URL tidak valid.").max(max).nullable(),
  );
}

function isValidIsoDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function nullableIsoDate() {
  return z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
      .refine(isValidIsoDate, "Tanggal tidak valid.")
      .nullable(),
  );
}

/**
 * Menerima angka maupun string dari form (mis. `"3.5"`), mengubah string kosong
 * menjadi `null`, lalu memvalidasi batasnya.
 */
export function nullableNumber(min: number, max: number, integer = false) {
  const numberSchema = integer ? z.number().int() : z.number();
  return z.preprocess((value) => {
    const normalized = emptyToNull(value);
    if (normalized === null) return null;
    if (typeof normalized === "string") {
      const parsed = Number(normalized);
      return Number.isNaN(parsed) ? normalized : parsed;
    }
    return normalized;
  }, numberSchema.min(min).max(max).nullable());
}

function nullableEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(emptyToNull, z.enum(values).nullable());
}

function atMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) === value * 100;
}

// ---------------------------------------------------------------------------
// Identitas
// ---------------------------------------------------------------------------

const birthDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
    .refine(isValidIsoDate, "Tanggal tidak valid.")
    .refine(
      (value) => new Date(`${value}T00:00:00.000Z`) <= new Date(),
      "Tanggal lahir tidak boleh di masa depan.",
    )
    .refine(
      (value) => Number(value.slice(0, 4)) >= 1940,
      "Tanggal lahir tidak wajar.",
    )
    .nullable(),
);

export const identitySchema = z.object({
  full_name: requiredText(120, "Nama wajib diisi."),
  headline: nullableText(160),
  summary: nullableText(2000),
  phone: nullableText(32),
  address: nullableText(200),
  birth_date: birthDate,
  linkedin_url: nullableUrl(),
  portfolio_url: nullableUrl(),
  expected_salary: nullableNumber(0, 1_000_000_000, true),
  availability: nullableText(80),
});

export const identityPatchSchema = identitySchema
  .partial()
  .extend({ onboarding_step: onboardingStepSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export type IdentityInput = z.input<typeof identitySchema>;
export type IdentityPatch = z.input<typeof identityPatchSchema>;

// ---------------------------------------------------------------------------
// Pendidikan
// ---------------------------------------------------------------------------

export const educationSchema = z
  .object({
    level: nullableEnum(EDUCATION_LEVELS),
    institution: requiredText(160, "Nama institusi wajib diisi."),
    major: nullableText(160),
    gpa: nullableNumber(0, 4),
    start_year: nullableNumber(1950, 2100, true),
    end_year: nullableNumber(1950, 2100, true),
  })
  .refine((value) => value.gpa === null || atMostTwoDecimals(value.gpa), {
    path: ["gpa"],
    message: "GPA maksimal 2 desimal.",
  })
  .refine(
    (value) =>
      value.start_year === null || value.end_year === null || value.start_year <= value.end_year,
    { path: ["end_year"], message: "Tahun selesai tidak boleh sebelum tahun mulai." },
  );

export type EducationInput = z.input<typeof educationSchema>;

// ---------------------------------------------------------------------------
// Pengalaman
// ---------------------------------------------------------------------------

export const experienceSchema = z
  .object({
    company: requiredText(160, "Nama perusahaan wajib diisi."),
    title: requiredText(160, "Posisi wajib diisi."),
    employment_type: nullableEnum(EMPLOYMENT_TYPES),
    start_date: nullableIsoDate(),
    end_date: nullableIsoDate(),
    is_current: z.boolean().default(false),
    description: nullableText(2000),
    points: z.array(requiredText(300)).max(20, "Maksimal 20 poin.").default([]),
  })
  .refine((value) => !value.is_current || value.end_date === null, {
    path: ["end_date"],
    message: "Pekerjaan saat ini tidak boleh punya tanggal selesai.",
  })
  .refine(
    (value) =>
      value.start_date === null ||
      value.end_date === null ||
      value.start_date <= value.end_date,
    { path: ["end_date"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai." },
  );

// ---------------------------------------------------------------------------
// Skill, sertifikasi, bahasa
// ---------------------------------------------------------------------------

export const skillSchema = z.object({
  name: requiredText(60, "Nama skill wajib diisi."),
  level: nullableEnum(SKILL_LEVELS),
  years: nullableNumber(0, 60),
});

export type SkillInput = z.input<typeof skillSchema>;

export const certificationSchema = z.object({
  name: requiredText(160, "Nama sertifikasi wajib diisi."),
  issuer: nullableText(160),
  year: nullableNumber(1950, 2100, true),
  credential_url: nullableUrl(),
});

export type CertificationInput = z.input<typeof certificationSchema>;

export const languageSchema = z.object({
  name: requiredText(60, "Nama bahasa wajib diisi."),
  proficiency: nullableText(40),
});

export type LanguageInput = z.input<typeof languageSchema>;

export const RESUME_TEMPLATE_IDS = ["A", "B"] as const;
export const createResumeSchema = z.object({
  template: z.enum(RESUME_TEMPLATE_IDS, {
    message: "Template harus A atau B.",
  }),
});
export type CreateResumeInput = z.input<typeof createResumeSchema>;

export type IdentityValues = z.output<typeof identitySchema>;
export type IdentityPatchValues = z.output<typeof identityPatchSchema>;
export type EducationValues = z.output<typeof educationSchema>;
export type ExperienceValues = z.output<typeof experienceSchema>;
export type SkillValues = z.output<typeof skillSchema>;
export type CertificationValues = z.output<typeof certificationSchema>;
export type LanguageValues = z.output<typeof languageSchema>;
