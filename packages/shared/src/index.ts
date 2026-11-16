/**
 * Konstanta dan schema domain yang dipakai bersama oleh web, worker, dan tooling.
 * Jangan menaruh nilai rahasia di sini.
 */

export * from "./schemas";

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
