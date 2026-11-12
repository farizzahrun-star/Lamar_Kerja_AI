/**
 * Konstanta dan schema domain yang dipakai bersama oleh web, worker, dan tooling.
 * Jangan menaruh nilai rahasia di sini.
 */

export * from "./schemas";

export const CV_AI_CONSENT_VERSION = "2026-11-06.v1";

export const CONSENT_KINDS = ["privacy", "cv_ai_processing", "ai_training_opt_in"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const CV_MAX_SIZE_BYTES = 10 * 1024 * 1024;
export const CV_RETENTION_DAYS = 30;

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
