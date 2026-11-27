import type { RunnerJobsSubmission, RunnerTaskResultInput } from "@lamarkerja/shared";
import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";

import { PlatformBlockedError, type JobCard, type SourceAdapter } from "./adapters/types";
import type { RunnerApiClient } from "./client";
import type { RunnerConfig } from "./config";
import { runDailyScrape } from "./run-daily";

function makeCard(platform: "glints" | "jobstreet" | "linkedin", idx: number): JobCard {
  return {
    platform,
    external_id: `${platform}-${idx}`,
    title: `Backend Engineer ${idx}`,
    company: `PT Contoh ${idx}`,
    location: "Jakarta",
    url: `https://${platform}.example.com/jobs/${idx}`,
  };
}

describe("runDailyScrape", () => {
  const baseConfig: RunnerConfig = {
    serverUrl: "http://localhost:3000",
    runnerToken: "lka_run_test_token_1234567890",
    scrapeLimitPerPlatform: 10,
    delayMinMs: 0,
    delayMaxMs: 0,
    browserProfilesDir: "./browser-profiles",
    debugHtmlDir: "./data/runner-debug",
    headless: true,
    pollIntervalMs: 60_000,
  };

  it("mematuhi kuota 10/platform, melewati lowongan dikenal, dan tetap lanjut jika satu platform diblokir", async () => {
    const submissions: RunnerJobsSubmission[] = [];
    let reportedResult: { taskId: string; payload: RunnerTaskResultInput } | null = null;

    const client: RunnerApiClient = {
      async pullTasks() {
        return {
          task: {
            id: "task-1",
            type: "scrape.daily",
            run_date: "2026-11-27",
            plan: {
              date: "2026-11-27",
              platforms: [
                {
                  platform: "glints",
                  limit: 10,
                  queries: [{ keyword: "backend", location: "Jakarta", limit: 10 }],
                },
                {
                  platform: "linkedin",
                  limit: 10,
                  queries: [{ keyword: "backend", location: "Jakarta", limit: 10 }],
                },
                {
                  platform: "jobstreet",
                  limit: 10,
                  queries: [{ keyword: "backend", location: "Jakarta", limit: 10 }],
                },
              ],
            },
          },
          knownFingerprints: {
            externalIds: ["glints-1"],
            canonicalUrls: [],
            rawHashes: [],
          },
        };
      },
      async submitJobs(payload) {
        submissions.push(payload);
        return { batchId: `batch-${submissions.length}`, collectorRunId: `run-${submissions.length}` };
      },
      async reportTaskResult(taskId, payload) {
        reportedResult = { taskId, payload };
      },
    };

    const glintsCards = Array.from({ length: 13 }, (_, i) => makeCard("glints", i + 1));
    const glintsAdapter: SourceAdapter = {
      platform: "glints",
      buildSearchUrl: () => "https://glints.example.com",
      isBlocked: async () => false,
      async *search() {
        for (const card of glintsCards) yield card;
      },
      async detail(_page, card) {
        return {
          job: {
            platform: "glints",
            external_id: card.external_id,
            title: card.title,
            company: card.company,
            location: card.location,
            work_mode: "hybrid",
            salary_min: null,
            salary_max: null,
            description: "Deskripsi lowongan contoh",
            url: card.url,
            posted_at: null,
            apply_channel: "link",
            hr_email: null,
          },
          rawHtml: "<html>ok</html>",
        };
      },
    };

    const linkedinAdapter: SourceAdapter = {
      platform: "linkedin",
      buildSearchUrl: () => "https://linkedin.example.com",
      isBlocked: async () => true,
      async *search() {
        throw new PlatformBlockedError("linkedin", "Authwall");
      },
      async detail() {
        throw new Error("Should not reach detail");
      },
    };

    const jobstreetAdapter: SourceAdapter = {
      platform: "jobstreet",
      buildSearchUrl: () => "https://jobstreet.example.com",
      isBlocked: async () => false,
      async *search() {
        yield makeCard("jobstreet", 1);
      },
      async detail(_page, card) {
        return {
          job: {
            platform: "jobstreet",
            external_id: card.external_id,
            title: card.title,
            company: card.company,
            location: card.location,
            work_mode: "remote",
            salary_min: null,
            salary_max: null,
            description: "Kirim CV ke hr@contoh.example.com",
            url: card.url,
            posted_at: null,
            apply_channel: "link",
            hr_email: null,
          },
          rawHtml: "<html>ok</html>",
        };
      },
    };

    const outcome = await runDailyScrape({
      config: baseConfig,
      client,
      adapters: {
        glints: glintsAdapter,
        linkedin: linkedinAdapter,
        jobstreet: jobstreetAdapter,
      },
      openPage: async () => ({
        page: {} as Page,
        close: vi.fn(async () => {}),
      }),
      delay: vi.fn(async () => {}),
      writeDebugHtml: vi.fn(async () => "debug.html"),
      cleanDebugHtml: vi.fn(async () => 0),
      log: vi.fn(),
    });

    expect(outcome.executed).toBe(true);
    expect(outcome.totalSubmitted).toBe(11); // 10 glints + 1 jobstreet
    expect(outcome.totalSkippedKnown).toBe(1); // glints-1 skipped
    expect(outcome.blockedPlatforms).toEqual(["linkedin"]);

    expect(submissions).toHaveLength(3);
    expect(submissions[0]?.jobs).toHaveLength(10);
    expect(submissions[0]?.skipped_known).toBe(1);
    expect(submissions[1]?.blocked).toBe(true);
    expect(submissions[1]?.jobs).toHaveLength(0);
    expect(submissions[2]?.jobs).toHaveLength(1);

    expect(reportedResult).toEqual({
      taskId: "task-1",
      payload: expect.objectContaining({
        status: "completed",
        summary: expect.objectContaining({
          blocked_platforms: ["linkedin"],
        }),
      }),
    });
  });
});
