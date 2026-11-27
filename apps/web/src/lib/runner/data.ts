import "server-only";

import { evaluateRunnerAlerts, shiftDateString, toJakartaDateString } from "@lamarkerja/shared";
import type { User } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

import { getAdminAccess } from "@/lib/auth";
import { recordAuditLog } from "@/lib/consent";
import { logEvent } from "@/lib/log";
import type { RunnerDashboardData, RunnerTokenItem } from "@/lib/phase2-types";
import { buildPlatformStatusSummary } from "@/lib/runner/platform-status";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

export function generateRunnerToken(): { rawToken: string; tokenHash: string } {
  const rawToken = `lka_run_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export async function loadRunnerDashboard(
  supabase: Client,
  user: Pick<User, "id" | "email">,
): Promise<RunnerDashboardData> {
  const minDate = shiftDateString(toJakartaDateString(), -14);

  const [runnersRes, sourcesRes, runsRes] = await Promise.all([
    supabase
      .from("runners")
      .select("id, name, last_seen_at, revoked_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_sources")
      .select("*")
      .order("platform", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("collector_runs")
      .select("*")
      .gte("run_date", minDate)
      .order("run_date", { ascending: false })
      .order("started_at", { ascending: false })
      .limit(60),
  ]);

  for (const res of [runnersRes, sourcesRes, runsRes]) {
    if (res.error) throw res.error;
  }

  const runs = runsRes.data ?? [];
  const sources = sourcesRes.data ?? [];
  const adminAccess = getAdminAccess(user);

  return {
    runners: runnersRes.data ?? [],
    sources,
    runs,
    alerts: evaluateRunnerAlerts(runs),
    platformStatus: buildPlatformStatusSummary(sources, runs),
    adminAccess: {
      canManageSources: adminAccess.isAdmin,
      openDevMode: adminAccess.openDevMode,
    },
  };
}

export async function createUserRunner(
  supabase: Client,
  userId: string,
  name: string,
): Promise<{ runner: RunnerTokenItem; rawToken: string }> {
  const { rawToken, tokenHash } = generateRunnerToken();

  const { data, error } = await supabase
    .from("runners")
    .insert({
      user_id: userId,
      name: name.trim(),
      token_hash: tokenHash,
    })
    .select("id, name, last_seen_at, revoked_at, created_at")
    .single();

  if (error) throw error;

  await recordAuditLog({
    actorId: userId,
    action: "runner.token_created",
    entity: "runners",
    entityId: data.id,
    meta: { name: data.name },
  });

  logEvent("info", "runner.token_created", { userId, runnerId: data.id });
  return { runner: data, rawToken };
}

export async function revokeUserRunner(
  supabase: Client,
  userId: string,
  runnerId: string,
): Promise<RunnerTokenItem | null> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("runners")
    .update({ revoked_at: nowIso })
    .eq("id", runnerId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id, name, last_seen_at, revoked_at, created_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  await recordAuditLog({
    actorId: userId,
    action: "runner.token_revoked",
    entity: "runners",
    entityId: data.id,
  });

  logEvent("info", "runner.token_revoked", { userId, runnerId: data.id });
  return data;
}

export async function toggleJobSourceEnabled(params: {
  actorId: string;
  sourceId: string;
  enabled: boolean;
}) {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("job_sources")
    .update({ enabled: params.enabled })
    .eq("id", params.sourceId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  await recordAuditLog({
    actorId: params.actorId,
    action: "job_source.toggled",
    entity: "job_sources",
    entityId: data.id,
    meta: { platform: data.platform, enabled: data.enabled },
  });

  logEvent("info", "job_source.toggled", {
    actorId: params.actorId,
    sourceId: data.id,
    platform: data.platform,
    enabled: data.enabled,
  });

  return data;
}
