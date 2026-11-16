import "server-only";

import type { Database } from "@lamarkerja/db";
import type { ConsentKind } from "@lamarkerja/shared";
import type { NextResponse } from "next/server";

import { jsonError } from "@/lib/api";
import { evaluateConsentRecord, hashUserAgent, type MinimalConsentRecord } from "@/lib/consent-core";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/log";
import type { ConsentRevokeResult, ConsentStatus } from "@/lib/profile-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
type JsonValue = Database["public"]["Tables"]["audit_log"]["Insert"]["meta_json"];

export async function recordAuditLog(entry: {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("audit_log").insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      meta_json: (entry.meta ?? {}) as unknown as JsonValue,
    });
  } catch {
    logEvent("warn", "audit.write_failed", { action: entry.action });
  }
}

export async function getConsentStatus(
  supabase: Client,
  userId: string,
  kind: ConsentKind = "cv_ai_processing",
  requiredVersion: string = env.CV_AI_CONSENT_VERSION,
): Promise<ConsentStatus> {
  const { data: activeRow, error } = await supabase
    .from("user_consents")
    .select("id, kind, version, accepted_at, revoked_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;

  const evaluation = evaluateConsentRecord(activeRow, requiredVersion);

  return {
    kind,
    requiredVersion,
    active: evaluation.ok,
    reason: evaluation.reason,
    consent: activeRow ?? null,
  };
}

export type RequireConsentResult =
  | { ok: true; consent: MinimalConsentRecord }
  | { ok: false; reason: "missing" | "revoked" | "outdated"; response: NextResponse };

/**
 * Memastikan user memiliki persetujuan aktif dengan versi terkini. Jika tidak,
 * mengembalikan respons HTTP `403 CONSENT_REQUIRED`.
 */
export async function requireConsent(
  supabase: Client,
  userId: string,
  kind: ConsentKind = "cv_ai_processing",
  requiredVersion: string = env.CV_AI_CONSENT_VERSION,
): Promise<RequireConsentResult> {
  const status = await getConsentStatus(supabase, userId, kind, requiredVersion);

  if (!status.active || !status.consent) {
    const failureReason = status.reason === "ok" ? "missing" : status.reason;
    logEvent("warn", "consent.blocked", {
      userId,
      kind,
      reason: failureReason,
      requiredVersion,
    });
    return {
      ok: false,
      reason: failureReason,
      response: jsonError(
        403,
        "CONSENT_REQUIRED",
        "Persetujuan pemrosesan AI versi terbaru wajib diberikan sebelum melanjutkan.",
      ),
    };
  }

  return { ok: true, consent: status.consent };
}

export async function grantConsent(
  supabase: Client,
  userId: string,
  kind: ConsentKind,
  userAgent: string | null,
  customVersion?: string,
): Promise<{ status: ConsentStatus; created: boolean }> {
  const targetVersion = customVersion?.trim() || env.CV_AI_CONSENT_VERSION;
  const nowIso = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from("user_consents")
    .select("id, kind, version, accepted_at, revoked_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .is("revoked_at", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing && existing.version === targetVersion) {
    return {
      status: {
        kind,
        requiredVersion: env.CV_AI_CONSENT_VERSION,
        active: targetVersion === env.CV_AI_CONSENT_VERSION,
        reason: targetVersion === env.CV_AI_CONSENT_VERSION ? "ok" : "outdated",
        consent: existing,
      },
      created: false,
    };
  }

  if (existing) {
    const { error: revokeOldError } = await supabase
      .from("user_consents")
      .update({ revoked_at: nowIso })
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (revokeOldError) throw revokeOldError;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("user_consents")
    .insert({
      user_id: userId,
      kind,
      version: targetVersion,
      accepted_at: nowIso,
      user_agent_hash: hashUserAgent(userAgent),
    })
    .select("id, kind, version, accepted_at, revoked_at")
    .single();

  if (insertError) throw insertError;

  await recordAuditLog({
    actorId: userId,
    action: "consent.granted",
    entity: "user_consents",
    entityId: inserted.id,
    meta: { kind, version: targetVersion },
  });

  logEvent("info", "consent.granted", {
    userId,
    kind,
    version: targetVersion,
  });

  return {
    status: {
      kind,
      requiredVersion: env.CV_AI_CONSENT_VERSION,
      active: targetVersion === env.CV_AI_CONSENT_VERSION,
      reason: targetVersion === env.CV_AI_CONSENT_VERSION ? "ok" : "outdated",
      consent: inserted,
    },
    created: true,
  };
}

/**
 * Mencabut persetujuan aktif user. Untuk `cv_ai_processing`, fungsi ini juga:
 * 1. Membatalkan semua `cv_parse_runs` berstatus `pending` / `running`.
 * 2. Menghapus seluruh `cv_parse_suggestions` milik user.
 * 3. Menjadwalkan penghapusan segera untuk seluruh `uploaded_cvs` milik user
 *    (`delete_after = now()`).
 */
export async function revokeConsent(
  supabase: Client,
  userId: string,
  kind: ConsentKind,
): Promise<ConsentRevokeResult> {
  const nowIso = new Date().toISOString();

  const { error: revokeError } = await supabase
    .from("user_consents")
    .update({ revoked_at: nowIso })
    .eq("user_id", userId)
    .eq("kind", kind)
    .is("revoked_at", null);

  if (revokeError) throw revokeError;

  let cancelledRuns = 0;
  let deletedSuggestions = 0;
  let scheduledFiles = 0;

  if (kind === "cv_ai_processing") {
    const admin = createAdminSupabase();

    const { data: runs, error: runsError } = await admin
      .from("cv_parse_runs")
      .update({
        status: "failed",
        error_code: "CONSENT_REVOKED",
        finished_at: nowIso,
      })
      .eq("user_id", userId)
      .in("status", ["pending", "running"])
      .select("id");

    if (runsError) throw runsError;
    cancelledRuns = runs?.length ?? 0;

    const { data: suggestions, error: suggestionsError } = await admin
      .from("cv_parse_suggestions")
      .delete()
      .eq("user_id", userId)
      .select("id");

    if (suggestionsError) throw suggestionsError;
    deletedSuggestions = suggestions?.length ?? 0;

    const { data: cvs, error: cvsError } = await admin
      .from("uploaded_cvs")
      .update({ delete_after: nowIso })
      .eq("user_id", userId)
      .select("id");

    if (cvsError) throw cvsError;
    scheduledFiles = cvs?.length ?? 0;
  }

  await recordAuditLog({
    actorId: userId,
    action: "consent.revoked",
    entity: "user_consents",
    meta: {
      kind,
      cancelledRuns,
      deletedSuggestions,
      scheduledFiles,
    },
  });

  logEvent("info", "consent.revoked", {
    userId,
    kind,
    cancelledRuns,
    deletedSuggestions,
    scheduledFiles,
  });

  return {
    kind,
    revoked_at: nowIso,
    cancelled_runs: cancelledRuns,
    deleted_suggestions: deletedSuggestions,
    scheduled_files: scheduledFiles,
  };
}
