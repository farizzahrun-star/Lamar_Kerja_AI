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
export type ConsentRow = Database["public"]["Tables"]["user_consents"]["Row"];
export type UploadedCvRow = Database["public"]["Tables"]["uploaded_cvs"]["Row"];
export type UploadedCvItem = Pick<
  UploadedCvRow,
  | "id"
  | "original_filename"
  | "mime"
  | "size_bytes"
  | "status"
  | "created_at"
  | "delete_after"
> & {
  hasText: boolean;
  charCount: number;
  parseRunsQueued?: number;
  message?: string;
};

export interface ConsentStatus {
  kind: ConsentRow["kind"];
  requiredVersion: string;
  active: boolean;
  reason: "ok" | "missing" | "revoked" | "outdated";
  consent: Pick<ConsentRow, "id" | "kind" | "version" | "accepted_at" | "revoked_at"> | null;
}

export interface ConsentRevokeResult {
  kind: ConsentRow["kind"];
  revoked_at: string;
  cancelled_runs: number;
  deleted_suggestions: number;
  scheduled_files: number;
}

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
