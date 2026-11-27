import "server-only";

import { ingestNormalizedJobBatch } from "@lamarkerja/shared";

import { recordAuditLog } from "@/lib/consent";
import { resolveManualSnapshotDate, type RawManualJobPayload } from "@/lib/jobs/normalize";
import { createAdminJobIngestStore, ensureJobSourceId } from "@/lib/jobs/supabase-ingest-store";
import { logEvent } from "@/lib/log";
import type { ManualIngestResult } from "@/lib/phase2-types";

export async function ingestManualJobs(params: {
  actorId: string;
  jobs: RawManualJobPayload[];
  mode: "url" | "text" | "csv";
  snapshotDate?: string | null;
  sourceName?: string;
}): Promise<ManualIngestResult> {
  const sourceId = await ensureJobSourceId({
    platform: "manual",
    type: "manual",
    name: params.sourceName ?? "Manual & CSV Import",
  });
  const snapshotDate = resolveManualSnapshotDate(params.snapshotDate);

  const result = await ingestNormalizedJobBatch(createAdminJobIngestStore(), {
    jobs: params.jobs,
    sourceId,
    snapshotDate,
    actorId: params.actorId,
  });

  const auditAction = params.mode === "csv" ? "jobs.csv_imported" : "jobs.manual_added";
  await recordAuditLog({
    actorId: params.actorId,
    action: auditAction,
    entity: "jobs",
    meta: {
      mode: params.mode,
      created: result.created,
      deduplicated: result.deduplicated,
      snapshotDate: result.snapshotDate,
    },
  });

  logEvent("info", auditAction, {
    actorId: params.actorId,
    mode: params.mode,
    created: result.created,
    deduplicated: result.deduplicated,
    snapshotDate: result.snapshotDate,
  });

  return {
    created: result.created,
    deduplicated: result.deduplicated,
    jobIds: result.jobIds,
    snapshotDate: result.snapshotDate,
  };
}
