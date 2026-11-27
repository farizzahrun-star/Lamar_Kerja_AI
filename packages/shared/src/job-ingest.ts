import { prepareNormalizedJob, type NormalizedJob, type RawJobInput } from "./jobs";
import type { ApplyChannel, JobPlatform, WorkMode } from "./phase2-schemas";

export interface JobIngestStore {
  findJobIdByExternalId(sourceId: string, externalId: string): Promise<string | null>;
  findJobIdByUrl(url: string): Promise<string | null>;
  findJobIdByRawHash(rawHash: string): Promise<string | null>;
  touchJobLastSeen(jobId: string, lastSeenAt: string): Promise<void>;
  insertJob(row: {
    source_id: string | null;
    external_id: string | null;
    title: string;
    company: string;
    location: string | null;
    work_mode: WorkMode | null;
    salary_min: number | null;
    salary_max: number | null;
    description: string;
    url: string | null;
    posted_at: string | null;
    first_seen_at: string;
    last_seen_at: string;
    raw_hash: string;
    created_by: string | null;
  }): Promise<string>;
  upsertJobUrl(row: {
    job_id: string;
    platform: JobPlatform;
    url: string;
    apply_channel: ApplyChannel;
    is_primary: boolean;
  }): Promise<void>;
  insertJobContactIfMissing(
    jobId: string,
    hrEmail: string,
    source: "description" | "manual",
  ): Promise<void>;
  upsertJobSnapshot(jobId: string, snapshotDate: string): Promise<void>;
}

export interface IngestBatchResult {
  created: number;
  deduplicated: number;
  jobIds: string[];
  snapshotDate: string;
  normalized: NormalizedJob[];
}

export async function ingestNormalizedJobBatch(
  store: JobIngestStore,
  params: {
    jobs: RawJobInput[];
    sourceId: string | null;
    snapshotDate: string;
    actorId?: string | null;
    nowIso?: string;
  },
): Promise<IngestBatchResult> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  let created = 0;
  let deduplicated = 0;
  const jobIds: string[] = [];
  const normalizedList: NormalizedJob[] = [];

  for (const raw of params.jobs) {
    const normalized = prepareNormalizedJob(raw);
    normalizedList.push(normalized);

    let existingJobId: string | null = null;
    if (params.sourceId && normalized.external_id) {
      existingJobId = await store.findJobIdByExternalId(params.sourceId, normalized.external_id);
    }
    if (!existingJobId && normalized.url) {
      existingJobId = await store.findJobIdByUrl(normalized.url);
    }
    if (!existingJobId) {
      existingJobId = await store.findJobIdByRawHash(normalized.raw_hash);
    }

    let jobId = existingJobId;
    if (jobId) {
      deduplicated++;
      await store.touchJobLastSeen(jobId, nowIso);
    } else {
      created++;
      jobId = await store.insertJob({
        source_id: params.sourceId,
        external_id: normalized.external_id,
        title: normalized.title,
        company: normalized.company,
        location: normalized.location,
        work_mode: normalized.work_mode,
        salary_min: normalized.salary_min,
        salary_max: normalized.salary_max,
        description: normalized.description,
        url: normalized.url,
        posted_at: normalized.posted_at,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        raw_hash: normalized.raw_hash,
        created_by: params.actorId ?? null,
      });
    }

    if (normalized.url) {
      await store.upsertJobUrl({
        job_id: jobId,
        platform: normalized.platform,
        url: normalized.url,
        apply_channel: normalized.apply_channel,
        is_primary: !existingJobId,
      });
    }

    for (const contact of normalized.hr_emails) {
      await store.insertJobContactIfMissing(jobId, contact.email, contact.source);
    }

    await store.upsertJobSnapshot(jobId, params.snapshotDate);
    jobIds.push(jobId);
  }

  return {
    created,
    deduplicated,
    jobIds,
    snapshotDate: params.snapshotDate,
    normalized: normalizedList,
  };
}
