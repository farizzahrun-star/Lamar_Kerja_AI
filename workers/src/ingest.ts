import {
  ingestNormalizedJobBatch,
  rawScrapedJobSchema,
  type JobIngestStore,
  type JobPlatform,
} from "@lamarkerja/shared";
import type { Database } from "@lamarkerja/db";

import type { WorkerLogger } from "./parse";
import type { WorkerSupabase } from "./supabase";

export type IngestBatchRow = Database["public"]["Tables"]["job_ingest_batches"]["Row"];

export interface IngestDeps {
  supabase: WorkerSupabase;
  maxAttempts: number;
  now?: () => Date;
  log?: WorkerLogger;
}

const defaultLog: WorkerLogger = (event, data) => {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`);
};

export function createWorkerJobIngestStore(supabase: WorkerSupabase): JobIngestStore {
  return {
    async findJobIdByExternalId(sourceId, externalId) {
      const { data, error } = await supabase
        .from("jobs")
        .select("id")
        .eq("source_id", sourceId)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async findJobIdByUrl(url) {
      const { data, error } = await supabase
        .from("jobs")
        .select("id")
        .eq("url", url)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async findJobIdByRawHash(rawHash) {
      const { data, error } = await supabase
        .from("jobs")
        .select("id")
        .eq("raw_hash", rawHash)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async touchJobLastSeen(jobId, lastSeenAt) {
      const { error } = await supabase
        .from("jobs")
        .update({ last_seen_at: lastSeenAt })
        .eq("id", jobId);
      if (error) throw error;
    },
    async insertJob(row) {
      const { data, error } = await supabase.from("jobs").insert(row).select("id").single();
      if (error) throw error;
      return data.id;
    },
    async upsertJobUrl(row) {
      const { error } = await supabase
        .from("job_urls")
        .upsert(row, { onConflict: "job_id,platform,url", ignoreDuplicates: false });
      if (error) throw error;
    },
    async insertJobContactIfMissing(jobId, hrEmail, source) {
      const { data: existing, error: readError } = await supabase
        .from("job_contacts")
        .select("id")
        .eq("job_id", jobId)
        .ilike("hr_email", hrEmail)
        .maybeSingle();
      if (readError) throw readError;
      if (existing) return;

      const { error: insertError } = await supabase.from("job_contacts").insert({
        job_id: jobId,
        hr_email: hrEmail,
        source,
      });
      if (insertError && insertError.code !== "23505") {
        throw insertError;
      }
    },
    async upsertJobSnapshot(jobId, snapshotDate) {
      const { error } = await supabase
        .from("job_snapshots")
        .upsert(
          { job_id: jobId, snapshot_date: snapshotDate },
          { onConflict: "job_id,snapshot_date", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
  };
}

async function resolveScrapeSourceId(
  supabase: WorkerSupabase,
  platform: JobPlatform,
): Promise<string | null> {
  const { data: existing, error } = await supabase
    .from("job_sources")
    .select("id")
    .eq("platform", platform)
    .eq("type", "guest_scrape")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from("job_sources")
    .insert({
      platform,
      type: "guest_scrape",
      name: `${platform} Guest Scrape`,
      enabled: true,
    })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return created.id;
}

export async function claimIngestBatch(deps: IngestDeps): Promise<IngestBatchRow | null> {
  const { supabase, now = () => new Date(), log = defaultLog } = deps;

  const { data: candidates, error: selectError } = await supabase
    .from("job_ingest_batches")
    .select("id, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);

  if (selectError) {
    log("jobs.ingest.select_failed", { code: selectError.code, message: selectError.message });
    return null;
  }

  for (const candidate of candidates ?? []) {
    const { data: claimed, error: claimError } = await supabase
      .from("job_ingest_batches")
      .update({
        status: "processing",
        started_at: now().toISOString(),
        attempts: candidate.attempts + 1,
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .eq("attempts", candidate.attempts)
      .select("*")
      .maybeSingle();

    if (claimError) {
      log("jobs.ingest.claim_failed", { batchId: candidate.id, code: claimError.code });
      continue;
    }

    if (claimed) return claimed;
  }

  return null;
}

export async function processIngestBatch(
  deps: IngestDeps,
  batch: IngestBatchRow,
): Promise<{ status: "completed" | "failed" | "requeued"; created: number; deduplicated: number }> {
  const { supabase, maxAttempts, now = () => new Date(), log = defaultLog } = deps;

  try {
    const payload = (batch.payload_json ?? {}) as { jobs?: unknown };
    const parsedJobs = rawScrapedJobSchema.array().safeParse(payload.jobs ?? []);
    if (!parsedJobs.success) {
      throw new Error("Payload jobs pada batch tidak valid.");
    }

    const sourceId = await resolveScrapeSourceId(supabase, batch.platform);
    const result = await ingestNormalizedJobBatch(createWorkerJobIngestStore(supabase), {
      jobs: parsedJobs.data,
      sourceId,
      snapshotDate: batch.run_date,
      nowIso: now().toISOString(),
    });

    if (batch.collector_run_id) {
      const { data: collectorRun } = await supabase
        .from("collector_runs")
        .select("new_count, skipped_known")
        .eq("id", batch.collector_run_id)
        .maybeSingle();

      if (collectorRun) {
        await supabase
          .from("collector_runs")
          .update({
            new_count: collectorRun.new_count + result.created,
            skipped_known: collectorRun.skipped_known + result.deduplicated,
          })
          .eq("id", batch.collector_run_id);
      }
    }

    const finishedAt = now().toISOString();
    await supabase
      .from("job_ingest_batches")
      .update({
        status: "completed",
        finished_at: finishedAt,
        summary_json: {
          created: result.created,
          deduplicated: result.deduplicated,
          snapshotDate: result.snapshotDate,
          jobIdsCount: result.jobIds.length,
        } as never,
      })
      .eq("id", batch.id);

    await supabase.from("audit_log").insert({
      actor_id: null,
      action: "jobs.ingested",
      entity: "job_ingest_batches",
      entity_id: batch.id,
      meta_json: {
        platform: batch.platform,
        runDate: batch.run_date,
        created: result.created,
        deduplicated: result.deduplicated,
      } as never,
    });

    log("jobs.ingest.completed", {
      batchId: batch.id,
      platform: batch.platform,
      created: result.created,
      deduplicated: result.deduplicated,
    });

    return {
      status: "completed",
      created: result.created,
      deduplicated: result.deduplicated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = batch.attempts < maxAttempts;

    await supabase
      .from("job_ingest_batches")
      .update({
        status: retryable ? "pending" : "failed",
        error_message: message.slice(0, 500),
        finished_at: retryable ? null : now().toISOString(),
      })
      .eq("id", batch.id);

    log("jobs.ingest.failed", {
      batchId: batch.id,
      platform: batch.platform,
      retryable,
      attempts: batch.attempts,
    });

    return {
      status: retryable ? "requeued" : "failed",
      created: 0,
      deduplicated: 0,
    };
  }
}
