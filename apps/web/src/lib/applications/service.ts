import "server-only";

import {
  selectBestApplicationChannel,
  type ApplyChannel,
} from "@lamarkerja/shared";

import {
  canCancelApplication,
  evaluateQueueRequest,
} from "@/lib/applications/core";
import { recordAuditLog } from "@/lib/consent";
import { getUserDailyQuota } from "@/lib/jobs/queries";
import { logEvent } from "@/lib/log";
import type { ApplicationListItem, ApplicationsOverview } from "@/lib/phase2-types";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export type QueueApplicationsResult =
  | {
      ok: true;
      created: Array<{ id: string; job_id: string; channel: ApplyChannel; status: "queued" }>;
      quota: { used: number; limit: number; remaining: number; dateWib: string };
    }
  | { ok: false; status: number; code: string; message: string };

export async function queueApplicationsForUser(
  supabase: Client,
  userId: string,
  requestedJobIds: string[],
): Promise<QueueApplicationsResult> {
  const quota = await getUserDailyQuota(supabase, userId);

  const uniqueRequested = [...new Set(requestedJobIds)];
  const [existingAppsRes, jobsRes] = await Promise.all([
    supabase
      .from("applications")
      .select("job_id, status")
      .eq("user_id", userId)
      .in("job_id", uniqueRequested)
      .neq("status", "cancelled"),
    supabase
      .from("jobs")
      .select("id, job_urls(apply_channel), job_contacts(hr_email)")
      .in("id", uniqueRequested),
  ]);

  if (existingAppsRes.error) throw existingAppsRes.error;
  if (jobsRes.error) throw jobsRes.error;

  const jobsById = new Map((jobsRes.data ?? []).map((job) => [job.id, job]));
  const missingJobIds = uniqueRequested.filter((id) => !jobsById.has(id));
  if (missingJobIds.length > 0) {
    return {
      ok: false,
      status: 404,
      code: "JOB_NOT_FOUND",
      message: "Sebagian lowongan tidak ditemukan.",
    };
  }

  const validation = evaluateQueueRequest({
    requestedJobIds: uniqueRequested,
    existingApplications: existingAppsRes.data ?? [],
    todayCount: quota.used,
    dailyLimit: quota.limit,
  });

  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status,
      code: validation.code,
      message: validation.message,
    };
  }

  const nowIso = new Date().toISOString();
  const rowsToInsert = validation.uniqueJobIds.map((jobId) => {
    const job = jobsById.get(jobId)!;
    const urls = (job.job_urls ?? []) as Array<{ apply_channel: ApplyChannel }>;
    const contacts = (job.job_contacts ?? []) as Array<{ hr_email: string }>;
    const bestChannel = selectBestApplicationChannel(
      urls.map((u) => u.apply_channel),
      contacts.length > 0,
    );

    return {
      user_id: userId,
      job_id: jobId,
      channel: bestChannel,
      status: "queued" as const,
      recipient_email: bestChannel === "email" ? (contacts[0]?.hr_email ?? null) : null,
      queued_at: nowIso,
    };
  });

  const { data: insertedApps, error: insertError } = await supabase
    .from("applications")
    .insert(rowsToInsert)
    .select("id, job_id, channel, status");

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        ok: false,
        status: 409,
        code: "ALREADY_APPLIED",
        message: "Salah satu lowongan sudah pernah diantrekan.",
      };
    }
    throw insertError;
  }

  const created = (insertedApps ?? []).map((row) => ({
    id: row.id,
    job_id: row.job_id,
    channel: row.channel,
    status: "queued" as const,
  }));

  if (created.length > 0) {
    const admin = createAdminSupabase();
    await admin.from("tracking_events").insert(
      created.map((item) => ({
        application_id: item.id,
        event_type: "application.queued",
        payload_json: { channel: item.channel },
      })),
    );

    await recordAuditLog({
      actorId: userId,
      action: "application.queued",
      entity: "applications",
      entityId: created.length === 1 ? created[0]!.id : null,
      meta: {
        count: created.length,
        jobIds: created.map((c) => c.job_id),
      },
    });

    logEvent("info", "application.queued", {
      userId,
      count: created.length,
    });
  }

  const nextUsed = quota.used + created.length;
  return {
    ok: true,
    created,
    quota: {
      used: nextUsed,
      limit: quota.limit,
      remaining: Math.max(0, quota.limit - nextUsed),
      dateWib: quota.dateWib,
    },
  };
}

export type CancelApplicationResult =
  | { ok: true; id: string; status: "cancelled"; cancelled_at: string }
  | { ok: false; status: number; code: string; message: string };

export async function cancelUserApplication(
  supabase: Client,
  userId: string,
  applicationId: string,
): Promise<CancelApplicationResult> {
  const { data: existing, error: readError } = await supabase
    .from("applications")
    .select("id, status, job_id")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;
  if (!existing) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Lamaran tidak ditemukan." };
  }

  if (!canCancelApplication(existing.status)) {
    return {
      ok: false,
      status: 409,
      code: "CANNOT_CANCEL",
      message: `Lamaran berstatus "${existing.status}" tidak dapat dibatalkan.`,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
    })
    .eq("id", applicationId)
    .eq("user_id", userId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    return {
      ok: false,
      status: 409,
      code: "CANNOT_CANCEL",
      message: "Status lamaran sudah berubah sebelum dibatalkan.",
    };
  }

  const admin = createAdminSupabase();
  await admin.from("tracking_events").insert({
    application_id: applicationId,
    event_type: "application.cancelled",
    payload_json: { previousStatus: existing.status },
  });

  await recordAuditLog({
    actorId: userId,
    action: "application.cancelled",
    entity: "applications",
    entityId: applicationId,
    meta: { jobId: existing.job_id },
  });

  logEvent("info", "application.cancelled", { userId, applicationId });

  return {
    ok: true,
    id: applicationId,
    status: "cancelled",
    cancelled_at: nowIso,
  };
}

export async function loadUserApplications(
  supabase: Client,
  userId: string,
): Promise<ApplicationsOverview> {
  const [appsRes, quota] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, job_id, channel, status, match_score, recipient_email, last_error, queued_at, ready_at, sent_at, replied_at, cancelled_at, jobs(id, title, company, location, work_mode, url), tracking_events(id, event_type, payload_json, created_at)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    getUserDailyQuota(supabase, userId),
  ]);

  if (appsRes.error) throw appsRes.error;

  const countsByStatus: Record<string, number> = {};
  const items: ApplicationListItem[] = (appsRes.data ?? []).map((row) => {
    countsByStatus[row.status] = (countsByStatus[row.status] ?? 0) + 1;
    const rawEvents = (row.tracking_events ?? []) as Array<{
      id: string;
      event_type: string;
      payload_json: Record<string, unknown>;
      created_at: string;
    }>;

    return {
      id: row.id,
      job_id: row.job_id,
      channel: row.channel,
      status: row.status,
      match_score: row.match_score,
      recipient_email: row.recipient_email,
      last_error: row.last_error,
      queued_at: row.queued_at,
      ready_at: row.ready_at,
      sent_at: row.sent_at,
      replied_at: row.replied_at,
      cancelled_at: row.cancelled_at,
      job: (row.jobs as ApplicationListItem["job"]) ?? null,
      events: [...rawEvents].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  });

  return {
    items,
    quota,
    countsByStatus,
  };
}
