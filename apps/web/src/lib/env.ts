import "server-only";

import { z } from "zod";

const envSchema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  REGISTRATION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  CV_AI_CONSENT_VERSION: z.string().min(1).default("2026-11-06.v1"),
  CV_STORAGE_DIR: z.string().min(1).default("./data/cv"),
  RESUME_STORAGE_DIR: z.string().min(1).default("./data/resumes"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");
  throw new Error(`Environment tidak valid: ${issues}`);
}

export const env = parsed.data;

export function requireSecretKey(): string {
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY wajib diisi untuk operasi server.");
  }
  return env.SUPABASE_SECRET_KEY;
}
