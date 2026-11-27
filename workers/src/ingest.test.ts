import { describe, expect, it, vi } from "vitest";

import { processIngestBatch, type IngestBatchRow } from "./ingest";
import type { WorkerSupabase } from "./supabase";

function createFakeIngestSupabase(options: { throwOnInsert?: boolean } = {}) {
  const updates: Array<{ table: string; values: Record<string, unknown>; id: string }> = [];
  const audits: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "job_sources") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { id: "src-1" }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => {
                if (options.throwOnInsert) throw new Error("db unavailable");
                return { data: { id: "job-1" }, error: null };
              },
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "job_urls") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table === "job_contacts") {
        return {
          select: () => ({
            eq: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }),
          insert: async () => ({ error: null }),
        };
      }
      if (table === "job_snapshots") {
        return { upsert: async () => ({ error: null }) };
      }
      if (table === "collector_runs") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { new_count: 0, skipped_known: 1 },
                error: null,
              }),
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updates.push({ table, values, id });
              return { error: null };
            },
          }),
        };
      }
      if (table === "job_ingest_batches") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              updates.push({ table, values, id });
              return { error: null };
            },
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            audits.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as WorkerSupabase;

  return { supabase, updates, audits };
}

describe("jobs.ingest worker", () => {
  const baseBatch: IngestBatchRow = {
    id: "batch-1",
    runner_id: "runner-1",
    collector_run_id: "run-1",
    platform: "glints",
    run_date: "2026-11-27",
    status: "processing",
    attempts: 1,
    created_at: "2026-11-27T05:00:00.000Z",
    started_at: "2026-11-27T05:00:01.000Z",
    finished_at: null,
    error_message: null,
    summary_json: null,
    payload_json: {
      jobs: [
        {
          platform: "glints",
          external_id: "g-10",
          title: "Backend Developer",
          company: "PT Contoh",
          location: "Jakarta",
          description: "Kirim CV ke hr@contoh.example.com",
          url: "https://glints.example.com/jobs/10",
        },
      ],
    },
  };

  it("memproses batch valid, memperbarui collector_runs, dan menulis audit_log", async () => {
    const { supabase, updates, audits } = createFakeIngestSupabase();
    const outcome = await processIngestBatch(
      { supabase, maxAttempts: 2, log: vi.fn() },
      baseBatch,
    );

    expect(outcome).toEqual({ status: "completed", created: 1, deduplicated: 0 });
    expect(updates).toContainEqual(
      expect.objectContaining({
        table: "collector_runs",
        values: { new_count: 1, skipped_known: 1 },
      }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        table: "job_ingest_batches",
        values: expect.objectContaining({ status: "completed" }),
      }),
    );
    expect(audits).toHaveLength(1);
  });

  it("mengembalikan batch ke pending jika gagal pada attempt pertama", async () => {
    const { supabase, updates } = createFakeIngestSupabase({ throwOnInsert: true });
    const outcome = await processIngestBatch(
      { supabase, maxAttempts: 2, log: vi.fn() },
      baseBatch,
    );

    expect(outcome.status).toBe("requeued");
    expect(updates).toContainEqual(
      expect.objectContaining({
        table: "job_ingest_batches",
        values: expect.objectContaining({ status: "pending" }),
      }),
    );
  });
});
