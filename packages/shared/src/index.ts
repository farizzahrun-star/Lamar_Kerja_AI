/**
 * Konstanta dan schema domain yang dipakai bersama oleh web, worker, dan tooling.
 * Jangan menaruh nilai rahasia di sini.
 */

export * from "./schemas";
export * from "./phase2-schemas";
export * from "./date";
export * from "./jobs";
export * from "./job-ingest";
export * from "./runner-alerts";
export * from "./runner-contracts";

export const CV_AI_CONSENT_VERSION = "2026-11-06.v1";

export const CV_AI_CONSENT_PARAGRAPHS = [
  "Saya menyetujui file CV dan profil saya diproses oleh model AI internal (Ollama qwen3:4b) yang berjalan di server proyek ini untuk membantu ekstraksi data profil dan pembuatan draf lamaran.",
  "Saya memahami bahwa data saya tidak pernah dikirim ke pihak ketiga seperti OpenAI, Google, Anthropic, atau penyedia AI eksternal lainnya.",
  "Pemrosesan ini bersifat opsional. Jika saya tidak menyetujui, saya tetap dapat mengisi profil secara manual dan menggunakan draf berbasis template. Saya berhak mencabut persetujuan ini kapan saja melalui menu Pengaturan, dan pencabutan akan menghapus seluruh data draf/saran hasil pemrosesan AI.",
] as const;

export const CV_AI_CONSENT_TEXT = CV_AI_CONSENT_PARAGRAPHS.join("\n\n");

export const CONSENT_KINDS = ["privacy", "cv_ai_processing", "ai_training_opt_in"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const CV_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const CV_RETENTION_DAYS = 30;

export const CV_PARSE_SECTIONS = ["identity", "experiences", "educations", "skills"] as const;
export type CvParseSection = (typeof CV_PARSE_SECTIONS)[number];

export const CV_MIN_TEXT_LENGTH_FOR_PARSING = 50;

export const CV_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export type CvMimeType = (typeof CV_ALLOWED_MIME_TYPES)[number];

export const RESUME_TEMPLATES = ["A", "B"] as const;
export type ResumeTemplate = (typeof RESUME_TEMPLATES)[number];

export function isResumeTemplate(value: string): value is ResumeTemplate {
  return (RESUME_TEMPLATES as readonly string[]).includes(value);
}

export function isAllowedCvMime(value: string): value is CvMimeType {
  return (CV_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function cvDeleteAfter(from: Date = new Date()): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + CV_RETENTION_DAYS);
  return result;
}

export const DEFAULT_INTERESTS = [
  { slug: "frontend-developer", label: "Frontend Developer" },
  { slug: "backend-developer", label: "Backend Developer" },
  { slug: "fullstack-developer", label: "Fullstack Developer" },
  { slug: "mobile-developer", label: "Mobile Developer" },
  { slug: "data-analyst", label: "Data Analyst" },
  { slug: "data-engineer", label: "Data Engineer" },
  { slug: "devops-engineer", label: "DevOps Engineer" },
  { slug: "qa-engineer", label: "QA Engineer" },
  { slug: "ui-ux-designer", label: "UI/UX Designer" },
  { slug: "product-manager", label: "Product Manager" },
  { slug: "digital-marketing", label: "Digital Marketing" },
  { slug: "finance-accounting", label: "Finance & Accounting" },
  { slug: "hr-people-operations", label: "HR & People Operations" },
  { slug: "operations-admin", label: "Operations & Admin" },
] as const;

export const JOB_PLATFORM_LABELS = {
  glints: "Glints",
  jobstreet: "Jobstreet",
  linkedin: "LinkedIn",
  glassdoor: "Glassdoor",
  manual: "Manual",
  ats: "ATS",
} as const;

export const WORK_MODE_LABELS = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
} as const;

export const APPLY_CHANNEL_LABELS = {
  email: "Email HR",
  easy_apply: "Easy Apply",
  portal: "Portal",
  link: "Hanya Link",
} as const;

export const APPLICATION_STATUS_LABELS = {
  queued: "Diantrekan",
  preparing: "Disiapkan",
  needs_user: "Perlu Tindakan",
  ready: "Siap Dikirim",
  sending: "Mengirim",
  sent: "Terkirim",
  replied: "Dibalas",
  failed: "Gagal",
  cancelled: "Dibatalkan",
} as const;
