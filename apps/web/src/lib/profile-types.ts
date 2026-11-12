import type { Database } from "@lamarkerja/db";

/**
 * Tipe data profil yang aman diimpor komponen client (tidak menarik kode
 * server). Semua timestamp tetap string karena melewati batas server → client.
 */

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type EducationRow = Database["public"]["Tables"]["educations"]["Row"];
export type ExperiencePointRow = Pick<
  Database["public"]["Tables"]["experience_points"]["Row"],
  "id" | "content" | "sort_order"
>;
export type ExperienceRow = Database["public"]["Tables"]["experiences"]["Row"] & {
  points: ExperiencePointRow[];
};
export type SkillRow = Database["public"]["Tables"]["skills"]["Row"];
export type CertificationRow = Database["public"]["Tables"]["certifications"]["Row"];
export type LanguageRow = Database["public"]["Tables"]["languages"]["Row"];
export type ResumeRow = Database["public"]["Tables"]["resumes"]["Row"];
export type ResumeListItem = Pick<
  ResumeRow,
  "id" | "version" | "template" | "created_at" | "application_id"
>;

export interface ProfileBundle {
  profile: ProfileRow;
  educations: EducationRow[];
  experiences: ExperienceRow[];
  skills: SkillRow[];
  certifications: CertificationRow[];
  languages: LanguageRow[];
}

export interface ResumeSnapshot extends ProfileBundle {
  generatedAt: string;
  email: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
