import {
  educationSchema,
  experienceSchema,
  identityPatchSchema,
  skillSchema,
  type EducationValues,
  type ExperienceValues,
  type SkillValues,
} from "@lamarkerja/shared";

import type { ProfileBundle } from "@/lib/profile-types";

/**
 * Logika murni untuk menggabungkan saran hasil parsing CV ke profil.
 *
 * Modul ini sengaja tidak mengimpor kode server agar bisa dipakai bersama oleh
 * Route Handler (mengeksekusi merge) dan komponen review (menampilkan pratinjau
 * duplikat). Tidak ada jalur di sini yang menulis data; eksekusi insert/update
 * dilakukan pemanggil.
 */

export type ReviewSection = "identity" | "experiences" | "educations" | "skills";

export interface MergeSuggestionInput {
  id: string;
  section: ReviewSection;
  field_path: string;
  value_json: unknown;
}

export type MergeDisposition = "applied" | "duplicate" | "invalid";

export interface MergeDecision {
  id: string;
  section: ReviewSection;
  disposition: MergeDisposition;
  reason?: string;
}

export interface MergeBuckets {
  identity: { patch: Record<string, unknown>; fields: string[] };
  experiences: Array<{ id: string; values: ExperienceValues }>;
  educations: Array<{ id: string; values: EducationValues }>;
  skills: Array<{ id: string; values: SkillValues }>;
}

export interface MergePlan extends MergeBuckets {
  decisions: MergeDecision[];
}

export type MergeableBundle = Pick<ProfileBundle, "experiences" | "educations" | "skills"> & {
  profile?: ProfileBundle["profile"];
};

const URL_IDENTITY_FIELDS = new Set(["linkedin_url", "portfolio_url"]);

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function experienceKey(values: {
  company: string;
  title: string;
  start_date: string | null;
}): string {
  return [values.company, values.title, values.start_date ?? ""].map(normalizeKey).join("|");
}

function educationKey(values: {
  institution: string;
  level: string | null;
  start_year: number | null;
}): string {
  return [values.institution, values.level ?? "", values.start_year ?? ""]
    .map((part) => normalizeKey(String(part)))
    .join("|");
}

function skillKey(name: string): string {
  return normalizeKey(name);
}

/**
 * Beberapa model mengembalikan URL tanpa skema (`linkedin.com/in/x`). Profil
 * mewajibkan URL absolut, jadi skema `https://` ditambahkan sebelum validasi.
 */
export function normalizeIdentityValue(field: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (URL_IDENTITY_FIELDS.has(field) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }

  return trimmed;
}

function validIdentityValue(field: string, value: unknown): string | null {
  const normalized = normalizeIdentityValue(field, value);
  if (normalized === null) return null;

  const parsed = identityPatchSchema.safeParse({ [field]: normalized });
  if (!parsed.success) return null;
  return normalized;
}

interface ExperiencePayload {
  company: string;
  title: string;
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  points: string[];
}

function parseExperience(value: unknown) {
  const parsed = experienceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseEducation(value: unknown) {
  const parsed = educationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseSkill(value: unknown) {
  const parsed = skillSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Menyusun rencana merge: field identitas yang akan di-patch, entri baru untuk
 * pengalaman/pendidikan/skill, dan keputusan per saran (applied/duplicate/
 * invalid). Dedupe dilakukan case-insensitive terhadap data profil yang sudah
 * ada maupun terhadap saran lain di batch yang sama.
 */
export function planMerges(
  bundle: MergeableBundle,
  suggestions: readonly MergeSuggestionInput[],
): MergePlan {
  const plan: MergePlan = {
    identity: { patch: {}, fields: [] },
    experiences: [],
    educations: [],
    skills: [],
    decisions: [],
  };

  const existingExperienceKeys = new Set(
    bundle.experiences.map((row) =>
      experienceKey({
        company: row.company,
        title: row.title,
        start_date: row.start_date,
      }),
    ),
  );
  const existingEducationKeys = new Set(
    bundle.educations.map((row) =>
      educationKey({
        institution: row.institution,
        level: row.level,
        start_year: row.start_year,
      }),
    ),
  );
  const existingSkillKeys = new Set(bundle.skills.map((row) => skillKey(row.name)));

  const decidedIdentityFields = new Set<string>();
  const profileRecord = (bundle.profile ?? {}) as Record<string, unknown>;

  const apply = (suggestion: MergeSuggestionInput, reason?: string) => {
    plan.decisions.push({
      id: suggestion.id,
      section: suggestion.section,
      disposition: "applied",
      ...(reason ? { reason } : {}),
    });
  };

  const skip = (
    suggestion: MergeSuggestionInput,
    disposition: Exclude<MergeDisposition, "applied">,
    reason: string,
  ) => {
    plan.decisions.push({
      id: suggestion.id,
      section: suggestion.section,
      disposition,
      reason,
    });
  };

  for (const suggestion of suggestions) {
    if (suggestion.section === "identity") {
      if (decidedIdentityFields.has(suggestion.field_path)) {
        skip(suggestion, "duplicate", "Field identitas yang sama sudah diproses.");
        continue;
      }

      const value = validIdentityValue(suggestion.field_path, suggestion.value_json);
      if (value === null) {
        skip(suggestion, "invalid", "Nilai tidak lolos validasi profil.");
        continue;
      }

      const existing = profileRecord[suggestion.field_path];
      if (typeof existing === "string" && existing.trim().toLowerCase() === value.toLowerCase()) {
        decidedIdentityFields.add(suggestion.field_path);
        skip(suggestion, "duplicate", "Nilai identitas sudah sama dengan profil.");
        continue;
      }

      decidedIdentityFields.add(suggestion.field_path);
      plan.identity.patch[suggestion.field_path] = value;
      plan.identity.fields.push(suggestion.field_path);
      apply(suggestion);
      continue;
    }

    if (suggestion.section === "experiences") {
      const parsed = parseExperience(suggestion.value_json);
      if (!parsed) {
        skip(suggestion, "invalid", "Data pengalaman tidak valid.");
        continue;
      }

      const payload: ExperiencePayload = {
        company: parsed.company,
        title: parsed.title,
        employment_type: parsed.employment_type,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        is_current: parsed.is_current,
        description: parsed.description,
        points: parsed.points,
      };

      const key = experienceKey(payload);
      if (existingExperienceKeys.has(key)) {
        skip(suggestion, "duplicate", "Pengalaman ini sudah ada di profil.");
        continue;
      }

      existingExperienceKeys.add(key);
      plan.experiences.push({ id: suggestion.id, values: parsed });
      apply(suggestion);
      continue;
    }

    if (suggestion.section === "educations") {
      const parsed = parseEducation(suggestion.value_json);
      if (!parsed) {
        skip(suggestion, "invalid", "Data pendidikan tidak valid.");
        continue;
      }

      const key = educationKey(parsed);
      if (existingEducationKeys.has(key)) {
        skip(suggestion, "duplicate", "Pendidikan ini sudah ada di profil.");
        continue;
      }

      existingEducationKeys.add(key);
      plan.educations.push({ id: suggestion.id, values: parsed });
      apply(suggestion);
      continue;
    }

    const parsed = parseSkill(suggestion.value_json);
    if (!parsed) {
      skip(suggestion, "invalid", "Data keahlian tidak valid.");
      continue;
    }

    const key = skillKey(parsed.name);
    if (existingSkillKeys.has(key)) {
      skip(suggestion, "duplicate", "Keahlian ini sudah ada di profil.");
      continue;
    }

    existingSkillKeys.add(key);
    plan.skills.push({ id: suggestion.id, values: parsed });
    apply(suggestion);
  }

  return plan;
}

/** ID saran yang harus ditandai `accepted` setelah merge dieksekusi. */
export function acceptedSuggestionIds(plan: MergePlan): string[] {
  return plan.decisions
    .filter((decision) => decision.disposition !== "invalid")
    .map((decision) => decision.id);
}

/** ID saran yang harus ditandai `rejected` karena nilainya tidak valid. */
export function invalidSuggestionIds(plan: MergePlan): string[] {
  return plan.decisions
    .filter((decision) => decision.disposition === "invalid")
    .map((decision) => decision.id);
}
