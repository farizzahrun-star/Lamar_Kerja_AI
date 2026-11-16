import { EDUCATION_LEVELS, EMPLOYMENT_TYPES, SKILL_LEVELS } from "@lamarkerja/shared";
import { z } from "zod";

/**
 * Versi prompt + skema keluaran. Menaikkan nilai ini menandakan kontrak saran
 * berubah; run lama tetap menyimpan `promptVersion` di `output_json` sehingga
 * hasil lama bisa ditelusuri.
 */
export const CV_PARSE_PROMPT_VERSION = "2026-11-16.v1";

const confidenceSchema = z.number().min(0).max(1);
const snippetSchema = z.string().trim().min(1).max(400);

export const IDENTITY_FIELDS = [
  "full_name",
  "headline",
  "summary",
  "phone",
  "address",
  "linkedin_url",
  "portfolio_url",
] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

const identityItemSchema = z.object({
  field: z.enum(IDENTITY_FIELDS),
  value: z.string().trim().min(1).max(2000),
  confidence: confidenceSchema,
  source_snippet: snippetSchema,
});

const monthNames: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Mengubah tanggal parsial hasil model ("2020", "2020-03", "Mar 2020",
 * "03/2020") menjadi ISO date lengkap. Mengembalikan null bila tidak dikenali,
 * supaya nilai tak valid tidak pernah masuk ke profil.
 */
export function coercePartialDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (!text) return null;

  const iso = text.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = iso[2] ? Number(iso[2]) : 1;
    const day = iso[3] ? Number(iso[3]) : 1;
    if (year < 1940 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const monthYear = text.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (monthYear) {
    const month = monthNames[monthYear[1] ?? ""];
    const year = Number(monthYear[2]);
    if (month && year >= 1940 && year <= 2100) {
      return `${year}-${pad2(month)}-01`;
    }
  }

  const numericMonthYear = text.match(/^(\d{1,2})[/-](\d{4})$/);
  if (numericMonthYear) {
    const month = Number(numericMonthYear[1]);
    const year = Number(numericMonthYear[2]);
    if (month >= 1 && month <= 12 && year >= 1940 && year <= 2100) {
      return `${year}-${pad2(month)}-01`;
    }
  }

  return null;
}

const partialDateSchema = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? null : value),
  z.union([z.string(), z.null()]),
);

const experienceItemSchema = z.object({
  company: z.string().trim().min(1).max(160),
  title: z.string().trim().min(1).max(160),
  employment_type: z.enum(EMPLOYMENT_TYPES).nullable().default(null),
  start_date: partialDateSchema.default(null),
  end_date: partialDateSchema.default(null),
  is_current: z.boolean().default(false),
  description: z.string().trim().max(2000).nullable().default(null),
  points: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  confidence: confidenceSchema,
  source_snippet: snippetSchema,
});

const educationItemSchema = z.object({
  institution: z.string().trim().min(1).max(160),
  level: z.enum(EDUCATION_LEVELS).nullable().default(null),
  major: z.string().trim().max(160).nullable().default(null),
  gpa: z.number().min(0).max(4).nullable().default(null),
  start_year: z.number().int().min(1940).max(2100).nullable().default(null),
  end_year: z.number().int().min(1940).max(2100).nullable().default(null),
  confidence: confidenceSchema,
  source_snippet: snippetSchema,
});

const skillItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  level: z.enum(SKILL_LEVELS).nullable().default(null),
  confidence: confidenceSchema,
  source_snippet: snippetSchema,
});

export const identityOutputSchema = z.object({ items: z.array(identityItemSchema).max(20) });
export const experiencesOutputSchema = z.object({
  items: z.array(experienceItemSchema).max(30),
});
export const educationsOutputSchema = z.object({ items: z.array(educationItemSchema).max(20) });
export const skillsOutputSchema = z.object({ items: z.array(skillItemSchema).max(60) });

export type IdentityItem = z.output<typeof identityItemSchema>;
export type ExperienceItem = z.output<typeof experienceItemSchema>;
export type EducationItem = z.output<typeof educationItemSchema>;
export type SkillItem = z.output<typeof skillItemSchema>;

export const SECTION_SCHEMAS = {
  identity: identityOutputSchema,
  experiences: experiencesOutputSchema,
  educations: educationsOutputSchema,
  skills: skillsOutputSchema,
} as const;

// ---------------------------------------------------------------------------
// JSON Schema untuk parameter `format` Ollama
// ---------------------------------------------------------------------------

const confidenceJson = { type: "number", minimum: 0, maximum: 1 };
const snippetJson = { type: "string", minLength: 1, maxLength: 400 };
const nullableString = (maxLength: number) => ({
  type: ["string", "null"],
  maxLength,
});

const IDENTITY_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: IDENTITY_FIELDS },
          value: { type: "string", minLength: 1, maxLength: 2000 },
          confidence: confidenceJson,
          source_snippet: snippetJson,
        },
        required: ["field", "value", "confidence", "source_snippet"],
      },
    },
  },
  required: ["items"],
};

const EXPERIENCES_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        properties: {
          company: { type: "string", minLength: 1, maxLength: 160 },
          title: { type: "string", minLength: 1, maxLength: 160 },
          employment_type: { type: ["string", "null"], enum: [...EMPLOYMENT_TYPES, null] },
          start_date: nullableString(10),
          end_date: nullableString(10),
          is_current: { type: "boolean" },
          description: nullableString(2000),
          points: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
          confidence: confidenceJson,
          source_snippet: snippetJson,
        },
        required: ["company", "title", "confidence", "source_snippet"],
      },
    },
  },
  required: ["items"],
};

const EDUCATIONS_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          institution: { type: "string", minLength: 1, maxLength: 160 },
          level: { type: ["string", "null"], enum: [...EDUCATION_LEVELS, null] },
          major: nullableString(160),
          gpa: { type: ["number", "null"], minimum: 0, maximum: 4 },
          start_year: { type: ["integer", "null"], minimum: 1940, maximum: 2100 },
          end_year: { type: ["integer", "null"], minimum: 1940, maximum: 2100 },
          confidence: confidenceJson,
          source_snippet: snippetJson,
        },
        required: ["institution", "confidence", "source_snippet"],
      },
    },
  },
  required: ["items"],
};

const SKILLS_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 60 },
          level: { type: ["string", "null"], enum: [...SKILL_LEVELS, null] },
          confidence: confidenceJson,
          source_snippet: snippetJson,
        },
        required: ["name", "confidence", "source_snippet"],
      },
    },
  },
  required: ["items"],
};

export const SECTION_JSON_SCHEMAS = {
  identity: IDENTITY_JSON_SCHEMA,
  experiences: EXPERIENCES_JSON_SCHEMA,
  educations: EDUCATIONS_JSON_SCHEMA,
  skills: SKILLS_JSON_SCHEMA,
} as const;

// ---------------------------------------------------------------------------
// Normalisasi + grounding
// ---------------------------------------------------------------------------

export function normalizeForGrounding(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

/**
 * Memastikan `source_snippet` benar-benar berasal dari teks CV (bukan halusinasi
 * model). Pencocokan dilakukan pada teks yang dinormalisasi spasi + huruf kecil.
 */
export function isGroundedSnippet(
  snippet: string,
  normalizedCvText: string,
  minRatio = 0.6,
): boolean {
  const normalizedSnippet = normalizeForGrounding(snippet);
  if (!normalizedSnippet) return false;
  if (normalizedCvText.includes(normalizedSnippet)) return true;

  // Snippet panjang kadang dipotong model; terima bila sebagian besar kalimat
  // awal snippet benar-benar muncul di teks CV.
  const words = normalizedSnippet.split(" ");
  if (words.length < 4) return false;

  const candidate = words.slice(0, Math.max(4, Math.ceil(words.length * minRatio))).join(" ");
  return normalizedCvText.includes(candidate);
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export interface NormalizedSuggestion {
  field_path: string;
  value_json: unknown;
  confidence: number;
  source_snippet: string;
}

/**
 * Mengubah keluaran model per bagian menjadi daftar saran siap simpan.
 * Saran yang tidak lolos grounding dibuang (bukan disimpan dengan skor rendah)
 * agar UI review hanya menampilkan data yang benar-benar ada di CV.
 */
export function buildSuggestions(
  section: "identity" | "experiences" | "educations" | "skills",
  output: unknown,
  cvText: string,
): { suggestions: NormalizedSuggestion[]; dropped: number } {
  const normalizedCvText = normalizeForGrounding(cvText);
  const suggestions: NormalizedSuggestion[] = [];
  let dropped = 0;

  if (section === "identity") {
    const parsed = identityOutputSchema.parse(output);
    const seen = new Set<string>();

    for (const item of parsed.items) {
      if (seen.has(item.field)) {
        dropped += 1;
        continue;
      }
      if (!isGroundedSnippet(item.source_snippet, normalizedCvText)) {
        dropped += 1;
        continue;
      }
      seen.add(item.field);
      suggestions.push({
        field_path: item.field,
        value_json: item.value,
        confidence: clampConfidence(item.confidence),
        source_snippet: item.source_snippet,
      });
    }
    return { suggestions, dropped };
  }

  if (section === "experiences") {
    const parsed = experiencesOutputSchema.parse(output);

    parsed.items.forEach((item, index) => {
      if (!isGroundedSnippet(item.source_snippet, normalizedCvText)) {
        dropped += 1;
        return;
      }

      const startDate = coercePartialDate(item.start_date);
      const endDate = coercePartialDate(item.end_date);
      // Tanggal selesai eksplisit selalu menang; `is_current` hanya dipakai
      // bila model benar-benar tidak menemukan tanggal selesai.
      const isCurrent = endDate === null && item.is_current;

      suggestions.push({
        field_path: `experiences[${index}]`,
        value_json: {
          company: item.company,
          title: item.title,
          employment_type: item.employment_type,
          start_date: startDate,
          end_date: isCurrent ? null : endDate,
          is_current: isCurrent,
          description: item.description,
          points: item.points,
        },
        confidence: clampConfidence(item.confidence),
        source_snippet: item.source_snippet,
      });
    });
    return { suggestions, dropped };
  }

  if (section === "educations") {
    const parsed = educationsOutputSchema.parse(output);

    parsed.items.forEach((item, index) => {
      if (!isGroundedSnippet(item.source_snippet, normalizedCvText)) {
        dropped += 1;
        return;
      }

      suggestions.push({
        field_path: `educations[${index}]`,
        value_json: {
          institution: item.institution,
          level: item.level,
          major: item.major,
          gpa: item.gpa,
          start_year: item.start_year,
          end_year: item.end_year,
        },
        confidence: clampConfidence(item.confidence),
        source_snippet: item.source_snippet,
      });
    });
    return { suggestions, dropped };
  }

  const parsed = skillsOutputSchema.parse(output);
  const seen = new Set<string>();

  for (const item of parsed.items) {
    const key = item.name.toLowerCase();
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    if (!isGroundedSnippet(item.source_snippet, normalizedCvText)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    suggestions.push({
      field_path: `skills[${suggestions.length}]`,
      value_json: { name: item.name, level: item.level },
      confidence: clampConfidence(item.confidence),
      source_snippet: item.source_snippet,
    });
  }

  return { suggestions, dropped };
}
