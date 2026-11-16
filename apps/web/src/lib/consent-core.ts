import { createHash } from "node:crypto";

export interface MinimalConsentRecord {
  id: string;
  kind: "privacy" | "cv_ai_processing" | "ai_training_opt_in";
  version: string;
  accepted_at: string;
  revoked_at: string | null;
}

export type ConsentEvaluation<T extends MinimalConsentRecord = MinimalConsentRecord> =
  | { ok: true; reason: "ok"; consent: T }
  | { ok: false; reason: "missing" | "revoked" | "outdated"; consent: T | null };

/**
 * Mengevaluasi apakah rekaman consent memenuhi syarat aktif dan cocok dengan
 * versi kebijakan yang diwajibkan server.
 */
export function evaluateConsentRecord<T extends MinimalConsentRecord>(
  record: T | null | undefined,
  requiredVersion: string,
): ConsentEvaluation<T> {
  if (!record) {
    return { ok: false, reason: "missing", consent: null };
  }
  if (record.revoked_at !== null) {
    return { ok: false, reason: "revoked", consent: record };
  }
  if (record.version !== requiredVersion) {
    return { ok: false, reason: "outdated", consent: record };
  }
  return { ok: true, reason: "ok", consent: record };
}

/**
 * Menghasilkan hash SHA-256 satu arah dari header User-Agent agar jejak audit
 * persetujuan tersimpan tanpa menyimpan string mentah browser pengguna.
 */
export function hashUserAgent(userAgent: string | null | undefined): string | null {
  const trimmed = userAgent?.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest("hex");
}
