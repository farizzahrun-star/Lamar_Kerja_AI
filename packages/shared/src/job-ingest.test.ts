import { describe, expect, it } from "vitest";

import { ingestNormalizedJobBatch, type JobIngestStore } from "./job-ingest";

function createMemoryStore(): JobIngestStore & {
  jobs: Array<{ id: string; source_id: string | null; external_id: string | null; url: string | null; raw_hash: string; last_seen_at: string }>;
  urls: Array<{ job_id: string; platform: string; url: string; apply_channel: string }>;
  contacts: Array<{ job_id: string; hr_email: string; source: string }>;
  snapshots: Array<{ job_id: string; snapshot_date: string }>;
} {
  const state = {
    jobs: [] as Array<{ id: string; source_id: string | null; external_id: string | null; url: string | null; raw_hash: string; last_seen_at: string }>,
    urls: [] as Array<{ job_id: string; platform: string; url: string; apply_channel: string }>,
    contacts: [] as Array<{ job_id: string; hr_email: string; source: string }>,
    snapshots: [] as Array<{ job_id: string; snapshot_date: string }>,
    async findJobIdByExternalId(sourceId: string, externalId: string) {
      return (
        state.jobs.find((j) => j.source_id === sourceId && j.external_id === externalId)?.id ?? null
      );
    },
    async findJobIdByUrl(url: string) {
      return state.jobs.find((j) => j.url === url)?.id ?? null;
    },
    async findJobIdByRawHash(rawHash: string) {
      return state.jobs.find((j) => j.raw_hash === rawHash)?.id ?? null;
    },
    async touchJobLastSeen(jobId: string, lastSeenAt: string) {
      const target = state.jobs.find((j) => j.id === jobId);
      if (target) target.last_seen_at = lastSeenAt;
    },
    async insertJob(row: {
      source_id: string | null;
      external_id: string | null;
      url: string | null;
      raw_hash: string;
      last_seen_at: string;
    }) {
      const id = `job-${state.jobs.length + 1}`;
      state.jobs.push({
        id,
        source_id: row.source_id,
        external_id: row.external_id,
        url: row.url,
        raw_hash: row.raw_hash,
        last_seen_at: row.last_seen_at,
      });
      return id;
    },
    async upsertJobUrl(row: { job_id: string; platform: string; url: string; apply_channel: string }) {
      const exists = state.urls.find(
        (u) => u.job_id === row.job_id && u.platform === row.platform && u.url === row.url,
      );
      if (!exists) state.urls.push(row);
    },
    async insertJobContactIfMissing(jobId: string, hrEmail: string, source: "description" | "manual") {
      const exists = state.contacts.find(
        (c) => c.job_id === jobId && c.hr_email.toLowerCase() === hrEmail.toLowerCase(),
      );
      if (!exists) state.contacts.push({ job_id: jobId, hr_email: hrEmail, source });
    },
    async upsertJobSnapshot(jobId: string, snapshotDate: string) {
      const exists = state.snapshots.find(
        (s) => s.job_id === jobId && s.snapshot_date === snapshotDate,
      );
      if (!exists) state.snapshots.push({ job_id: jobId, snapshot_date: snapshotDate });
    },
  };

  return state;
}

describe("ingestNormalizedJobBatch", () => {
  it("melakukan dedupe berdasarkan external_id, canonical url, dan raw_hash", async () => {
    const store = createMemoryStore();

    const first = await ingestNormalizedJobBatch(store, {
      sourceId: "src-glints",
      snapshotDate: "2026-11-27",
      jobs: [
        {
          platform: "glints",
          external_id: "g-1",
          title: "Backend Developer",
          company: "PT Awan Contoh",
          location: "Jakarta",
          url: "https://glints.com/id/jobs/1?utm_source=x",
          description: "Kirim lamaran ke careers@awan.example.com",
        },
      ],
    });
    expect(first.created).toBe(1);
    expect(first.deduplicated).toBe(0);

    // Same job from another platform (different external_id & url) deduped via raw_hash
    const second = await ingestNormalizedJobBatch(store, {
      sourceId: "src-jobstreet",
      snapshotDate: "2026-11-27",
      jobs: [
        {
          platform: "jobstreet",
          external_id: "js-99",
          title: "Backend Developer",
          company: "PT Awan Contoh",
          location: "Jakarta",
          url: "https://id.jobstreet.com/id/job/99",
          description: "Deskripsi tanpa email",
          apply_channel: "easy_apply",
        },
      ],
    });
    expect(second.created).toBe(0);
    expect(second.deduplicated).toBe(1);
    expect(store.jobs).toHaveLength(1);
    expect(store.urls).toHaveLength(2);
    expect(store.contacts).toHaveLength(1);
  });
});
