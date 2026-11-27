import { describe, expect, it, vi } from "vitest";

import { ensureDailyRunnerPlan } from "./plan";
import type { WorkerSupabase } from "./supabase";

describe("runner.plan worker", () => {
  it("membuat task scrape.daily baru saat belum ada untuk tanggal WIB berjalan", async () => {
    const insertedRows: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table === "runner_tasks") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: (row: Record<string, unknown>) => {
              insertedRows.push(row);
              return {
                select: () => ({
                  single: async () => ({ data: { id: "task-1" }, error: null }),
                }),
              };
            },
          };
        }
        if (table === "job_sources") {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [
                    { platform: "glints", enabled: true },
                    { platform: "jobstreet", enabled: true },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "user_interests") {
          return {
            select: async () => ({
              data: [{ interests: { label: "Backend Developer" } }],
              error: null,
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              not: async () => ({
                data: [{ address: "Bandung, Indonesia" }],
                error: null,
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    } as unknown as WorkerSupabase;

    const result = await ensureDailyRunnerPlan({
      supabase,
      now: () => new Date("2026-11-27T04:00:00.000Z"),
      log: vi.fn(),
    });

    expect(result).toEqual({
      created: true,
      runDate: "2026-11-27",
      taskId: "task-1",
    });
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]?.type).toBe("scrape.daily");
  });
});
