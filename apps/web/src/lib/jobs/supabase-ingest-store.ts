import "server-only";

import type { JobIngestStore, JobPlatform } from "@lamarkerja/shared";

import { createAdminSupabase } from "@/lib/supabase/admin";

export async function ensureJobSourceId(params: {
  platform: JobPlatform;
  type: "guest_scrape" | "feed" | "api" | "manual";
  name: string;
}): Promise<string> {
  const admin = createAdminSupabase();
  const { data: existing, error: selectError } = await admin
    .from("job_sources")
    .select("id")
    .eq("platform", params.platform)
    .eq("type", params.type)
    .eq("name", params.name)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await admin
    .from("job_sources")
    .insert({
      platform: params.platform,
      type: params.type,
      name: params.name,
      enabled: true,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

export function createAdminJobIngestStore(): JobIngestStore {
  const admin = createAdminSupabase();

  return {
    async findJobIdByExternalId(sourceId, externalId) {
      const { data, error } = await admin
        .from("jobs")
        .select("id")
        .eq("source_id", sourceId)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async findJobIdByUrl(url) {
      const { data, error } = await admin
        .from("jobs")
        .select("id")
        .eq("url", url)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async findJobIdByRawHash(rawHash) {
      const { data, error } = await admin
        .from("jobs")
        .select("id")
        .eq("raw_hash", rawHash)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async touchJobLastSeen(jobId, lastSeenAt) {
      const { error } = await admin
        .from("jobs")
        .update({ last_seen_at: lastSeenAt })
        .eq("id", jobId);
      if (error) throw error;
    },
    async insertJob(row) {
      const { data, error } = await admin.from("jobs").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async upsertJobUrl(row) {
      const { error } = await admin
        .from("job_urls")
        .upsert(row, { onConflict: "job_id,platform,url", ignoreDuplicates: false });
      if (error) throw error;
    },
    async insertJobContactIfMissing(jobId, hrEmail, source) {
      const { data: existing, error: readError } = await admin
        .from("job_contacts")
        .select("id")
        .eq("job_id", jobId)
        .ilike("hr_email", hrEmail)
        .maybeSingle();
      if (readError) throw readError;
      if (existing) return;

      const { error: insertError } = await admin.from("job_contacts").insert({
        job_id: jobId,
        hr_email: hrEmail,
        source,
      });
      if (insertError && insertError.code !== "23505") {
        throw insertError;
      }
    },
    async upsertJobSnapshot(jobId, snapshotDate) {
      const { error } = await admin
        .from("job_snapshots")
        .upsert(
          { job_id: jobId, snapshot_date: snapshotDate },
          { onConflict: "job_id,snapshot_date", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
  };
}
